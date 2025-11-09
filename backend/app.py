from flask import Flask, jsonify, abort, request
from slope import calculate_daily_drain_rates, calculate_daily_slopes
from utils import get_cauldron_data
from utils.forecasting import get_forecast
from utils.scheduling import create_daily_schedule, fetch_cauldrons, fetch_couriers, fetch_market, fetch_network_data
from ticket_tracker import verify_cauldrons
from tcp_server import tcp_server
from pathlib import Path
from datetime import datetime
import pandas as pd
import json
import datetime
import threading
from collections import deque
import time
import socket
import requests

# ===================================================================
# THREAD-SAFE GLOBAL DATA STORES & LOCKS
# ===================================================================

# --- For Live TCP Data ---
tcp_data = deque(maxlen=100) 
tcp_data_lock = threading.Lock()

# --- For Periodically Updated DataFrames ---
# We need a separate lock for these to avoid unnecessary blocking
df_lock = threading.Lock()

# Initialize global DataFrame variables. They will be loaded once on startup
# and then updated periodically by our new background thread.
data_db = None
fill_rate_df = None
drain_rate_df = None

# --- For Cached Static Data ---
static_data_lock = threading.Lock()
cached_cauldrons = None
cached_couriers = None
cached_market = None
cached_network = None
cache_timestamp = None
CACHE_DURATION_SECONDS = 3600  # Cache for 1 hour

# ===================================================================
# BACKGROUND WORKER THREADS
# ===================================================================

def tcp_client_worker():
    """
    Connects to a TCP server to receive live data.
    (This function remains unchanged)
    """
    HOST = '127.0.0.1'
    PORT = 3000

    while True:
        try:
            print("[TCP Thread] Attempting to connect...")
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.connect((HOST, PORT))
                print(f"[TCP Thread] Connected to {HOST}:{PORT}")
                while True:
                    data = s.recv(16)
                    if not data:
                        print("[TCP Thread] Connection closed by server. Reconnecting...")
                        break 
                    
                    decoded_data = data.decode('utf-8')
                    # Safely append data to our shared deque
                    with tcp_data_lock:
                        tcp_data.append({'timestamp': time.time(), 'message': decoded_data})

        except ConnectionRefusedError:
            print("[TCP Thread] Connection refused. Retrying in 5 seconds...")
            time.sleep(5)
        except Exception as e:
            print(f"[TCP Thread] An error occurred: {e}. Retrying in 5 seconds...")
            time.sleep(5)


def data_update_worker():
    """
    This function runs in a background thread. Every 15 minutes, it
    re-calculates the dataframes and updates the global variables safely.
    """
    global data_db, fill_rate_df, drain_rate_df
    
    while True:
        print("[Update Thread] Starting scheduled data update...")
        try:
            # Perform the expensive calculations first
            new_data_db = get_cauldron_data()
            new_fill_rate_df = calculate_daily_slopes()
            new_drain_rate_df = calculate_daily_drain_rates()
            
            # --- CRITICAL SECTION: Acquire the lock to update global variables ---
            with df_lock:
                print("[Update Thread] Lock acquired. Updating global DataFrames.")
                data_db = new_data_db
                fill_rate_df = new_fill_rate_df
                drain_rate_df = new_drain_rate_df
                
                # Also save them to disk
                data_db.to_csv("data.csv", header=True, index=False)
                fill_rate_df.to_csv("fill_rate_db.csv", header=True, index=False)
                drain_rate_df.to_csv("drain_rate_db.csv", header=True, index=False)
                print("[Update Thread] Global DataFrames and CSV files updated.")
            
        except Exception as e:
            print(f"[Update Thread] An error occurred during the update: {e}")
            
        # Wait for 15 minutes (900 seconds) before the next run
        print("[Update Thread] Update complete. Sleeping for 15 minutes.")
        time.sleep(900)

# ===================================================================
# INITIAL DATA LOAD ON STARTUP
# ===================================================================
def initial_load():
    """
    Loads initial data so the app is immediately responsive on startup.
    This runs ONCE before the recurring updates begin.
    """
    global data_db, fill_rate_df, drain_rate_df
    print("[Main Thread] Performing initial data load...")
    with df_lock: # Use lock even here for consistency
        data_db = get_cauldron_data()
        fill_rate_df = calculate_daily_slopes()
        drain_rate_df = calculate_daily_drain_rates()
        # Also save to disk on first run
        data_db.to_csv("data.csv", header=True, index=False)
        fill_rate_df.to_csv("fill_rate_db.csv", header=True, index=False)
        drain_rate_df.to_csv("drain_rate_db.csv", header=True, index=False)
    print("[Main Thread] Initial data load complete.")

# ===================================================================
# FLASK APPLICATION SETUP
# ===================================================================
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

initial_load()
# --- Routes ---
@app.route('/')
def index():
    return "Hello, World!"

@app.route("/api/drain_rate/<cauldron_id>/<date>")
def get_drain_rate_section_route(cauldron_id, date):
    with df_lock: # Acquire lock before reading
        if drain_rate_df is None:
            abort(503, description="Data is not available yet. Please try again later.")
        result = drain_rate_df[(drain_rate_df["cauldron"] == cauldron_id) & (drain_rate_df["date"] == date)]
    
    if result.empty:
        abort(404, description="Drain rate data not found for the specified cauldron and date.")
    return json.dumps(result.to_dict())

@app.route("/api/fill_rate/<cauldron_id>/<date>")
def get_fill_rate_section_route(cauldron_id, date):
    with df_lock: # Acquire lock before reading
        if fill_rate_df is None:
            abort(503, description="Data is not available yet. Please try again later.")
        result = fill_rate_df[(fill_rate_df["cauldron"] == cauldron_id) & (fill_rate_df["date"] == date)]

    if result.empty:
        abort(404, description="Fill rate data not found for the specified cauldron and date.")
    return json.dumps(result.to_dict())

@app.route("/api/amounts")
def amounts():
    with df_lock: # Acquire lock before reading
        if data_db is None:
            abort(503, description="Data is not available yet. Please try again later.")
        return json.dumps(data_db.to_dict())

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

@app.route("/api/cauldrons-info")
@app.route("/api/proxy/cauldrons-info")
def get_cauldrons_info():
    """Proxy endpoint to fetch cauldrons info from external API"""
    try:
        response = requests.get('https://hackutd2025.eog.systems/api/Information/cauldrons')
        response.raise_for_status()
        return jsonify(response.json())
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 500

@app.route("/api/cauldron-levels-data")
@app.route("/api/proxy/cauldron-levels")
def get_cauldron_levels_data():
    """Proxy endpoint to fetch cauldron levels data from external API"""
    try:
        response = requests.get('https://hackutd2025.eog.systems/api/Data')
        response.raise_for_status()
        return jsonify(response.json())
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 500

# ===================================================================
# FORECASTING AND SCHEDULING ENDPOINTS
# ===================================================================

def get_cached_static_data():
    """Get or refresh cached static data."""
    global cached_cauldrons, cached_couriers, cached_market, cached_network, cache_timestamp
    
    with static_data_lock:
        current_time = time.time()
        
        # Check if cache is valid
        if (cache_timestamp is None or 
            (current_time - cache_timestamp) > CACHE_DURATION_SECONDS or
            cached_cauldrons is None):
            
            print("[Cache] Refreshing static data cache...")
            try:
                cached_cauldrons = fetch_cauldrons()
                cached_couriers = fetch_couriers()
                cached_market = fetch_market()
                cached_network = fetch_network_data()
                cache_timestamp = current_time
                print("[Cache] Static data cache refreshed.")
            except Exception as e:
                print(f"[Cache] Error refreshing cache: {e}")
        
        return cached_cauldrons, cached_couriers, cached_market, cached_network

@app.route("/api/Forecast")
def get_forecast_endpoint():
    """Get forecast data for all cauldrons."""
    try:
        cauldrons, _, _, _ = get_cached_static_data()
        if not cauldrons:
            return jsonify({'error': 'No cauldron data available'}), 503
        
        # Convert to dict format expected by forecasting
        cauldron_info = {c['id']: c for c in cauldrons}
        
        forecasts = get_forecast(cauldron_info)
        return jsonify(forecasts)
    except Exception as e:
        print(f"Error in forecast endpoint: {e}")
        return jsonify({'error': str(e)}), 500

@app.route("/api/Schedule/daily")
def get_daily_schedule():
    """Get daily schedule for couriers."""
    try:
        date = request.args.get('date')  # Optional date parameter
        schedule = create_daily_schedule(date)
        return jsonify(schedule)
    except Exception as e:
        print(f"Error in schedule endpoint: {e}")
        return jsonify({'error': str(e)}), 500

@app.route("/api/couriers")
def get_couriers_endpoint():
    """Get courier information."""
    try:
        _, couriers, _, _ = get_cached_static_data()
        if couriers is None:
            return jsonify({'error': 'No courier data available'}), 503
        return jsonify(couriers)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route("/api/market")
def get_market_endpoint():
    """Get market information."""
    try:
        _, _, market, _ = get_cached_static_data()
        if market is None:
            return jsonify({'error': 'No market data available'}), 503
        return jsonify(market)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route("/api/network")
def get_network_endpoint():
    """Get network information."""
    try:
        _, _, _, network = get_cached_static_data()
        if network is None:
            return jsonify({'error': 'No network data available'}), 503
        return jsonify(network)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Test route to verify new endpoints are loaded
@app.route("/api/test-forecast")
def test_forecast():
    """Test route to verify forecast module is loaded."""
    return jsonify({'status': 'ok', 'message': 'Forecast endpoints are loaded'})
