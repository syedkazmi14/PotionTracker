from flask import Flask, jsonify, abort, request
from slope import calculate_daily_drain_rates, calculate_daily_slopes
from utils import get_cauldron_data
from ticket_tracker import verify_cauldrons
from tcp_server import tcp_server
from pathlib import Path
from datetime import datetime
import pandas as pd
import json

app = Flask(__name__)

# Enable CORS for all routes
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    return response

# Start TCP server on app startup
try:
    tcp_server.start()
    print("TCP server started successfully")
except Exception as e:
    print(f"Failed to start TCP server: {e}")

# The line "from app import routes" has been removed.

DRAIN_RATE_DB = "drain_rate_db.csv"
FILL_RATE_DB = "fill_rate_db.csv"
DATA_DB = "data.csv"

# Load data on startup instead of on every request
if Path(DRAIN_RATE_DB).exists():
    drain_rate_df = pd.read_csv(DRAIN_RATE_DB)
else:
    drain_rate_df = calculate_daily_drain_rates()
    drain_rate_df.to_csv(DRAIN_RATE_DB, header=True, index=False)

if Path(FILL_RATE_DB).exists():
    fill_rate_df = pd.read_csv(FILL_RATE_DB)
else:
    fill_rate_df = calculate_daily_slopes()
    fill_rate_df.to_csv(FILL_RATE_DB, header=True, index=False)
if Path(DATA_DB).exists():
    data_db = pd.read_csv(DATA_DB)
else:
    data_db=get_cauldron_data()
    data_db.to_csv(DATA_DB,header=True, index=False)

@app.route('/')
def index():
    return "Hello, World!"

@app.route("/api/drain_rate/<cauldron_id>/<date>")
def get_drain_rate_section_route(cauldron_id, date):
    # Make sure to convert cauldron_id to the correct type if necessary, e.g., int()
    result = drain_rate_df[(drain_rate_df["cauldron"] == cauldron_id) & (drain_rate_df["date"] == date)]
    if result.empty:
        abort(404, description="Drain rate data not found for the specified cauldron and date.")
    return json.dumps(result.to_dict())

@app.route("/api/fill_rate/<cauldron_id>/<date>")
def get_fill_rate_section_route(cauldron_id, date):
    # Make sure to convert cauldron_id to the correct type if necessary, e.g., int()
    result = fill_rate_df[(fill_rate_df["cauldron"] == cauldron_id) & (fill_rate_df["date"] == date)]
    if result.empty:
        abort(404, description="Fill rate data not found for the specified cauldron and date.")
    return json.dumps(result.to_dict())

@app.route("/api/amounts")
def amounts():
    try:
        return json.dumps(data_db.to_dict())
    except:
        abort(404, description="Data DB is missing.")

@app.route("/api/get_descrepencies/")
def get_descrepencies():
    return verify_cauldrons()

@app.route("/api/live_data")
def get_live_data():
    """Get latest live data from TCP socket connection"""
    data = tcp_server.get_latest_data()
    return jsonify(data)

@app.route("/api/live_data/update", methods=['POST'])
def update_live_data():
    """Manually update live data (for testing without hardware)"""
    try:
        data = request.get_json()
        taken_liters = float(data.get('taken_liters', 0))
        reported_liters = float(data.get('reported_liters', 0))
        discrepancy = taken_liters - reported_liters
        
        with tcp_server.lock:
            tcp_server.latest_data = {
                'taken_liters': taken_liters,
                'reported_liters': reported_liters,
                'discrepancy': discrepancy,
                'timestamp': datetime.now().isoformat(),
                'connected': True
            }
        
        return jsonify(tcp_server.latest_data)
    except Exception as e:
        return jsonify({'error': str(e)}), 400
