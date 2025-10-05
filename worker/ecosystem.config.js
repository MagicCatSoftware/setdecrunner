module.exports = {
  apps: [{
    name: 'runsheet-ocr-worker',
    cwd: '/var/www/setdecrunnerofficial/worker',
    script: '/var/www/setdecrunnerofficial/worker/worker_ocr.py',
    interpreter: '/var/www/setdecrunnerofficial/worker/.venv/bin/python',
    env: {
      LOG_LEVEL: 'DEBUG',
      QUEUE_DIR: '/var/www/setdecrunnerofficial/uploads/ocr/queue',
      UPLOADS_DIR: '/var/www/setdecrunnerofficial/uploads',
      MONGODB_URI: 'mongodb://localhost:27017/setdec',
      OPENAI_API_KEY: 'REPLACE_ME',
      API_BASE: 'http://127.0.0.1:4001'
    }
  }]
}
