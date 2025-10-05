#!/usr/bin/env python3
import os
import time
import base64
import json
import logging
import hashlib
from datetime import datetime, timezone
from typing import Tuple, Dict, Any, Optional

from dotenv import load_dotenv
from pymongo import MongoClient
from bson import ObjectId
from openai import OpenAI

# --------------------------- env & config ---------------------------
load_dotenv()

MONGO_URL    = os.getenv("MONGO_URL", "mongodb://127.0.0.1:27017/setdec")
MONGO_DB     = os.getenv("MONGO_DB", "setdec")
MONGO_COLL   = os.getenv("MONGO_RS_COLL", "runsheets")

# IMPORTANT: point this at your Node server's uploads folder
# e.g. /var/www/setdecrunnerofficial/server/uploads
UPLOADS_DIR  = os.getenv("UPLOADS_DIR", os.path.join(os.getcwd(), "uploads"))

# Filesystem job queue directory written by your Node API
QUEUE_DIR    = os.getenv("QUEUE_DIR", os.path.join(UPLOADS_DIR, "ocr_queue"))

POLL_SECONDS = float(os.getenv("OCR_WORKER_POLL_SECONDS", "3"))
BATCH_SIZE   = int(os.getenv("OCR_WORKER_BATCH_SIZE", "3"))
MODEL        = os.getenv("OCR_MODEL", "gpt-4o-mini")
APPLY_FIELDS = os.getenv("OCR_APPLY_SAFE_FIELDS", "1") == "1"
MAX_TEXT_LEN = int(os.getenv("OCR_MAX_SEARCH_TEXT", "1000000"))

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")

# --------------------------- logging ---------------------------
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="[%(asctime)s] %(levelname)s %(message)s"
)
log = logging.getLogger("runsheet-ocr-worker")

# --------------------------- clients ---------------------------
if not OPENAI_API_KEY:
    log.error("OPENAI_API_KEY not set. Exiting.")
    raise SystemExit(1)

ai = OpenAI(api_key=OPENAI_API_KEY)

mongo = MongoClient(MONGO_URL)
db = mongo[MONGO_DB]
rs_coll = db[MONGO_COLL]

# --------------------------- helpers ---------------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def ensure_dirs():
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    os.makedirs(QUEUE_DIR, exist_ok=True)
    os.makedirs(os.path.join(QUEUE_DIR, "done"), exist_ok=True)
    os.makedirs(os.path.join(QUEUE_DIR, "failed"), exist_ok=True)
    os.makedirs(os.path.join(QUEUE_DIR, "processing"), exist_ok=True)

def local_image_path(public_path: str) -> str:
    """
    Convert '/uploads/ocr/<id>/file.png' or '/api/uploads/ocr/<id>/file.png'
    to an absolute path inside UPLOADS_DIR.
    """
    if not public_path:
        return ""
    p = public_path.strip()
    if p.startswith("/api/"):
        p = p[len("/api/"):]  # 'uploads/...'
    if p.startswith("/"):
        p = p[1:]
    if not p.startswith("uploads/"):
        p = f"uploads/{p}"
    rel = p[len("uploads/"):]  # 'ocr/<id>/file.png'
    return os.path.join(UPLOADS_DIR, rel)

def image_mime_from_ext(path: str) -> str:
    pl = path.lower()
    if pl.endswith(".png"):
        return "image/png"
    if pl.endswith(".webp"):
        return "image/webp"
    return "image/jpeg"

def file_b64_data_url(path: str) -> Tuple[str, bytes]:
    with open(path, "rb") as f:
        raw = f.read()
    mime = image_mime_from_ext(path)
    return f"data:{mime};base64,{base64.b64encode(raw).decode('utf-8')}", raw

def sha1_bytes(b: bytes) -> str:
    return hashlib.sha1(b).hexdigest()

def parse_ai_content_to_json(content: str) -> Dict[str, Any]:
    if not content:
        return {"text": "", "fields": {}}
    fence = None
    if "```" in content:
        import re
        m = re.search(r"```json\s*([\s\S]*?)```", content, re.IGNORECASE)
        if m:
            fence = m.group(1)
    raw = fence or content
    start = raw.find("{")
    end = raw.rfind("}")
    candidate = raw[start:end+1] if (start != -1 and end != -1 and end > start) else raw
    try:
        data = json.loads(candidate)
        text = str(data.get("text", "") or "")
        fields = data.get("fields", {})
        if not isinstance(fields, dict):
            fields = {}
        return {"text": text, "fields": fields}
    except Exception:
        return {"text": str(content), "fields": {}}

def build_search_text(text: str, fields: Dict[str, Any]) -> str:
    parts = [text or ""]
    try:
        parts.append(json.dumps(fields or {}, ensure_ascii=False))
    except Exception:
        pass
    joined = " ".join([p for p in parts if p]).strip()
    return joined[:MAX_TEXT_LEN] if len(joined) > MAX_TEXT_LEN else joined

def safe_apply_fields(rs: Dict[str, Any], fields: Dict[str, Any]) -> Dict[str, Any]:
    if not APPLY_FIELDS:
        return {}
    updates = {}

    po = fields.get("poNumber") or fields.get("po") or fields.get("po_no")
    if isinstance(po, str) and po.strip():
        updates["poNumber"] = po.strip()

    cheque = fields.get("chequeNumber") or fields.get("cheque") or fields.get("checkNumber")
    if isinstance(cheque, str) and cheque.strip():
        updates["chequeNumber"] = cheque.strip()

    amt = fields.get("amount") or fields.get("total") or fields.get("subtotal")
    if isinstance(amt, (int, float)):
        updates["amount"] = float(amt)
    elif isinstance(amt, str):
        try:
            val = float(amt.replace("$", "").replace(",", "").strip())
            updates["amount"] = val
        except Exception:
            pass

    paid = fields.get("paid")
    if isinstance(paid, bool):
        updates["paid"] = paid
    elif isinstance(paid, str):
        low = paid.lower()
        if low in ("yes", "true", "y"):
            updates["paid"] = True
        elif low in ("no", "false", "n"):
            updates["paid"] = False

    try:
        from dateutil import parser as dateparser
        for key in ("date", "pickupDate", "returnDate", "pdDate", "rdDate"):
            v = fields.get(key)
            if isinstance(v, str) and v.strip():
                try:
                    d = dateparser.parse(v, dayfirst=False, yearfirst=False)
                    updates[key] = d
                except Exception:
                    pass
    except Exception:
        pass

    pt = fields.get("purchaseType")
    if isinstance(pt, str) and pt.lower() in ("purchase", "rental"):
        updates["purchaseType"] = pt.lower()

    pl = fields.get("postLocation")
    allowed_pl = {"hold_on_truck", "office", "setdec_storage", "address_below"}
    if isinstance(pl, str) and pl in allowed_pl:
        updates["postLocation"] = pl

    return updates

def mark_status(rs_id: ObjectId, status: str, extra_set: Optional[Dict[str, Any]] = None) -> None:
    set_doc = {"ocr.latest.meta.status": status, "ocr.latest.meta.updatedAt": now_utc()}
    if extra_set:
        set_doc.update(extra_set)
    rs_coll.update_one({"_id": rs_id}, {"$set": set_doc})

# --------------------------- OCR call ---------------------------
def run_ocr_on_path(abs_path: str) -> Dict[str, Any]:
    data_url, raw = file_b64_data_url(abs_path)
    system_prompt = (
        "You are a precise OCR engine. Return ONLY strict JSON with keys: "
        '"text" (all readable content) and "fields" (key/value of recognizable labels like '
        'supplier, phone, PO number, cheque number, dates, checkboxes like "Hold On Truck", '
        'names in columns, totals, etc.). If something is unreadable include "[?]" in text.'
    )
    user_prompt = "Extract text and fields from this runsheet image. Respond with strict JSON only."
    resp = ai.chat.completions.create(
        model=MODEL,
        temperature=0.2,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": [
                {"type": "text", "text": user_prompt},
                {"type": "image_url", "image_url": {"url": data_url}}
            ]}
        ]
    )
    content = (resp.choices[0].message.content or "").strip()
    parsed = parse_ai_content_to_json(content)
    tokens = getattr(getattr(resp, "usage", None), "total_tokens", 0)
    return {"text": parsed.get("text") or "", "fields": parsed.get("fields") or {}, "tokens": tokens, "raw": None, "raw_content": content, "raw_usage": getattr(resp, "usage", None)}

# --------------------------- DB path ---------------------------
def process_one_db(rs_doc: Dict[str, Any]) -> None:
    rs_id = rs_doc["_id"]
    latest = (rs_doc.get("ocr") or {}).get("latest") or {}
    image_public = latest.get("image") or ""
    if not image_public:
        mark_status(rs_id, "error", {"ocr.latest.meta.error": "No image path in ocr.latest.image"})
        log.warning("DB %s has no image path; skipping", rs_id)
        return

    abs_path = local_image_path(image_public)
    if not os.path.isfile(abs_path):
        mark_status(rs_id, "error", {"ocr.latest.meta.error": f"Image not found: {abs_path}"})
        log.warning("DB %s image not found at %s", rs_id, abs_path)
        return

    try:
        with open(abs_path, "rb") as f:
            raw = f.read()
        img_hash = sha1_bytes(raw)
    except Exception as e:
        mark_status(rs_id, "error", {"ocr.latest.meta.error": f"Read image failed: {e}"})
        log.exception("Read image failed for %s", rs_id)
        return

    prev_hash = ((rs_doc.get("ocr") or {}).get("latest") or {}).get("meta", {}).get("imageHash")
    if prev_hash and prev_hash == img_hash and latest.get("text"):
        mark_status(rs_id, "done")
        log.info("DB %s already processed (same image hash).", rs_id)
        return

    try:
        result = run_ocr_on_path(abs_path)
        text, fields, tokens = result["text"], result["fields"], result["tokens"]
        search_text = build_search_text(text, fields)

        history_rec = {
            "kind": "by_hand",
            "model": MODEL,
            "image": image_public,
            "text": text,
            "fields": fields,
            "tokens": tokens,
            "meta": {"source": "worker", "status": "done", "processedAt": now_utc(), "imageHash": img_hash},
            "createdAt": now_utc(),
        }

        top_updates = safe_apply_fields(rs_doc, fields)

        set_doc = {
            "ocr.latest.text": text,
            "ocr.latest.fields": fields,
            "ocr.latest.model": MODEL,
            "ocr.latest.tokens": tokens,
            "ocr.latest.meta.status": "done",
            "ocr.latest.meta.processedAt": now_utc(),
            "ocr.latest.meta.imageHash": img_hash,
            "ocr.searchText": search_text,
            "updatedAt": now_utc(),
        }
        if top_updates:
            set_doc.update(top_updates)

        rs_coll.update_one({"_id": rs_id}, {"$set": set_doc, "$push": {"ocr.history": history_rec}})
        log.info("DB %s processed OK (%s tokens).", rs_id, tokens)
    except Exception as e:
        mark_status(rs_id, "error", {"ocr.latest.meta.error": str(e)})
        log.exception("OCR failed for %s", rs_id)

def fetch_batch_db() -> list:
    query = {
        "ocr.latest.image": {"$exists": True, "$ne": ""},
        "ocr.latest.meta.status": {"$in": ["queued", "processing", None]},
    }
    cur = rs_coll.find(query).sort([("updatedAt", -1)]).limit(BATCH_SIZE)
    docs = list(cur)
    log.info("Mongo: found %d queued docs", len(docs))
    return docs

# --------------------------- Queue path ---------------------------
def list_queue_jobs() -> list:
    try:
        files = [f for f in os.listdir(QUEUE_DIR) if f.endswith(".json")]
    except FileNotFoundError:
        files = []
    log.info("Queue: found %d job files", len(files))
    return files

def claim_job_file(name: str) -> Optional[str]:
    """
    Atomically rename job -> processing/<name>.lock to claim it.
    Returns claimed absolute path, or None if lost the race.
    """
    src = os.path.join(QUEUE_DIR, name)
    dst = os.path.join(QUEUE_DIR, "processing", name + ".lock")
    try:
        os.rename(src, dst)
        return dst
    except FileNotFoundError:
        return None
    except PermissionError:
        return None

def complete_job_file(locked_path: str, success: bool):
    base = os.path.basename(locked_path).replace(".lock", "")
    target_dir = "done" if success else "failed"
    dst = os.path.join(QUEUE_DIR, target_dir, base)
    try:
        os.rename(locked_path, dst)
    except Exception:
        try:
            os.remove(locked_path)
        except Exception:
            pass

def process_one_job(locked_path: str):
    try:
        with open(locked_path, "r", encoding="utf-8") as f:
            job = json.load(f)
    except Exception as e:
        log.exception("Bad job file %s: %s", locked_path, e)
        complete_job_file(locked_path, success=False)
        return

    runsheet_id = job.get("runsheetId")
    image_abs = job.get("imageAbsPath") or ""
    image_public = job.get("imagePublicPath") or ""
    if not image_abs:
        image_abs = local_image_path(image_public)

    if not runsheet_id or not image_abs:
        log.error("Job missing runsheetId or image path: %s", locked_path)
        complete_job_file(locked_path, success=False)
        return

    try:
        rs_id = ObjectId(runsheet_id)
    except Exception:
        log.error("Invalid runsheetId in job: %s", runsheet_id)
        complete_job_file(locked_path, success=False)
        return

    rs_doc = rs_coll.find_one({"_id": rs_id})
    if not rs_doc:
        log.error("Runsheet not found: %s", runsheet_id)
        complete_job_file(locked_path, success=False)
        return

    # Mark processing
    mark_status(rs_id, "processing", {"ocr.latest.meta.startedAt": now_utc()})

    if not os.path.isfile(image_abs):
        mark_status(rs_id, "error", {"ocr.latest.meta.error": f"Image not found: {image_abs}"})
        log.error("Image missing for job %s at %s", locked_path, image_abs)
        complete_job_file(locked_path, success=False)
        return

    try:
        with open(image_abs, "rb") as f:
            raw = f.read()
        img_hash = sha1_bytes(raw)

        result = run_ocr_on_path(image_abs)
        text, fields, tokens = result["text"], result["fields"], result["tokens"]
        search_text = build_search_text(text, fields)

        history_rec = {
            "kind": job.get("kind") or "by_hand",
            "model": MODEL,
            "image": image_public,
            "text": text,
            "fields": fields,
            "tokens": tokens,
            "meta": {"source": "worker", "status": "done", "processedAt": now_utc(), "imageHash": img_hash, "jobId": job.get("jobId")},
            "createdAt": now_utc(),
        }

        top_updates = safe_apply_fields(rs_doc, fields)

        set_doc = {
            "ocr.latest.text": text,
            "ocr.latest.fields": fields,
            "ocr.latest.model": MODEL,
            "ocr.latest.tokens": tokens,
            "ocr.latest.meta.status": "done",
            "ocr.latest.meta.processedAt": now_utc(),
            "ocr.latest.meta.imageHash": img_hash,
            "ocr.searchText": search_text,
            "updatedAt": now_utc(),
        }
        if top_updates:
            set_doc.update(top_updates)

        rs_coll.update_one({"_id": rs_id}, {"$set": set_doc, "$push": {"ocr.history": history_rec}})
        log.info("Job %s processed OK for RS %s (%s tokens).", job.get("jobId"), runsheet_id, tokens)
        complete_job_file(locked_path, success=True)
    except Exception as e:
        mark_status(rs_id, "error", {"ocr.latest.meta.error": str(e)})
        log.exception("Job %s failed for RS %s", job.get("jobId"), runsheet_id)
        complete_job_file(locked_path, success=False)

# --------------------------- main loop ---------------------------
def main():
    ensure_dirs()
    log.info("Runsheet OCR Worker started. UPLOADS_DIR=%s  QUEUE_DIR=%s  Poll=%.1fs  Model=%s",
             UPLOADS_DIR, QUEUE_DIR, POLL_SECONDS, MODEL)
    while True:
        try:
            # 1) Queue-first: process any job files
            jobs = list_queue_jobs()
            if jobs:
                for name in jobs[:BATCH_SIZE]:
                    claimed = claim_job_file(name)
                    if not claimed:
                        continue
                    process_one_job(claimed)
                # After queue work, loop again immediately
                continue

            # 2) Fallback to Mongo polling (for legacy/compat)
            batch = fetch_batch_db()
            if not batch:
                time.sleep(POLL_SECONDS)
                continue

            for rs in batch:
                rs_id = rs["_id"]
                mark_status(rs_id, "processing", {"ocr.latest.meta.startedAt": now_utc()})
                process_one_db(rs)

        except KeyboardInterrupt:
            log.info("Interrupted; exiting.")
            break
        except Exception:
            log.exception("Top-level loop error.")
            time.sleep(POLL_SECONDS)

if __name__ == "__main__":
    main()

