#!/usr/bin/env python3
import os
import time
import requests
import logging
from threading import Thread
from flask import Flask, jsonify

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

SERVICE_NAME = os.getenv('SERVICE_NAME', 'unknown')
TARGETS = os.getenv('TARGETS', '').split(',') if os.getenv('TARGETS') else []
INTERVALS = list(map(int, os.getenv('INTERVALS', '60').split(',')))

@app.route('/health')
def health():
    return jsonify({'status': 'healthy', 'service': SERVICE_NAME}), 200

@app.route('/')
def index():
    return jsonify({
        'service': SERVICE_NAME,
        'message': f'Hello from {SERVICE_NAME}!',
        'targets': TARGETS,
        'intervals': INTERVALS
    }), 200

def make_request(target, interval):
    """Periodically make HTTP requests to target service"""
    while True:
        try:
            logging.info(f"[{SERVICE_NAME}] Calling {target}...")
            response = requests.get(f'http://{target}', timeout=5)
            logging.info(f"[{SERVICE_NAME}] Response from {target}: {response.status_code}")
        except Exception as e:
            logging.error(f"[{SERVICE_NAME}] Error calling {target}: {e}")

        time.sleep(interval)

def start_periodic_calls():
    """Start background threads for periodic HTTP calls"""
    for i, target in enumerate(TARGETS):
        if target:
            interval = INTERVALS[i] if i < len(INTERVALS) else 60
            thread = Thread(target=make_request, args=(target, interval), daemon=True)
            thread.start()
            logging.info(f"[{SERVICE_NAME}] Started periodic calls to {target} every {interval}s")

if __name__ == '__main__':
    logging.info(f"Starting {SERVICE_NAME}...")
    logging.info(f"Targets: {TARGETS}")
    logging.info(f"Intervals: {INTERVALS}")

    # Start periodic calls in background
    start_periodic_calls()

    # Start Flask server
    app.run(host='0.0.0.0', port=8080)
