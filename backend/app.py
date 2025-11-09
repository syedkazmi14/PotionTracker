from flask import Flask, jsonify, abort, request
from slope import calculate_daily_drain_rates, calculate_daily_slopes
from utils import get_cauldron_data
from utils.forecasting import get_forecast
from utils.scheduling import create_daily_schedule, fetch_cauldrons, fetch_couriers, fetch_market, fetch_network_data
from ticket_tracker import verify_cauldrons
from pathlib import Path
from datetime import datetime
import pandas as pd
import json
import datetime
import threading
from collections import deque
import time
import socket
import struct 
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
live_db = None
# ===================================================================
# BACKGROUND WORKER THREADS
# ===================================================================

def client_handler_thread(connection, client_address, stop_event):
    """
    This function runs in its own thread and handles communication
    with a single connected client.
    """
    print(f"[TCP Handler: {client_address}] Thread started.", flush=True)
    try:
        # Use a context manager to ensure the connection is always closed
        with connection:
            connection.settimeout(1.0) # Make recv non-blocking

            while not stop_event.is_set():
                try:
                    data = connection.recv(20)
                    if not data:
                        print(f"[TCP Handler: {client_address}] Connection closed by client.", flush=True)
                        break # Exit the loop if client disconnects
                    
                    if len(data) == 20:
                        header, pot1, pot2, bv_int, unused = struct.unpack('<IIIII', data)
                        if header == 1:
                            pass
                        elif header ==2:
                            pass
                        elif header == 3:
                            pass
                        elif header ==4:
                            pass
                        print(f"[TCP Handler: {client_address}] Received: header={header} pot1={pot1}, pot2={pot2}", flush=True)
                        # Here you would process the data, e.g., update the live_db
                        # with df_lock:
                        #    # update logic here...
                    else:
                        print(f"[TCP Handler: {client_address}] Received incomplete data packet.", flush=True)

                except socket.timeout:
                    # It's normal for recv to time out; this allows us to check the stop_event
                    continue
                except (ConnectionResetError, BrokenPipeError):
                    print(f"[TCP Handler: {client_address}] Connection was forcibly closed.", flush=True)
                    break # Exit the loop
                except Exception as e:
                    print(f"[TCP Handler: {client_address}] Error during recv: {e}", flush=True)
                    break # Exit the loop on other errors
    
    finally:
        print(f"[TCP Handler: {client_address}] Thread finished.", flush=True)


def start_tcp_server(stop_event):
    """
    Starts a non-blocking TCP server that listens for connections and
    spawns a new thread to handle each client.
    """ 
    host = '0.0.0.0'
    port = 3000
    
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server_socket:
        try:
            # This option allows the server to reuse the address, preventing "Address already in use" errors
            server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            server_socket.bind((host, port))
        except OSError as e:
            print(f"[TCP Listener] FATAL: Could not bind to port {port}. {e}", flush=True)
            return

        server_socket.listen()
        server_socket.settimeout(1.0) # Make the listener non-blocking
        print(f"[TCP Listener] Server listening on {host}:{port}", flush=True)

        client_threads = []

        while not stop_event.is_set():
            try:
                # Accept a new connection (will only block for 1 second)
                connection, client_address = server_socket.accept()
                
                print(f"[TCP Listener] Accepted new connection from {client_address}", flush=True)
                
                # Create and start a new thread to handle this client
                handler = threading.Thread(
                    target=client_handler_thread, 
                    args=(connection, client_address, stop_event),
                    daemon=True # Daemon threads won't block program exit
                )
                handler.start()
                client_threads.append(handler)

            except socket.timeout:
                # This is the normal case when no one is connecting.
                # It allows us to check the stop_event again.
                continue
            except Exception as e:
                print(f"[TCP Listener] An error occurred while accepting connections: {e}", flush=True)
                stop_event.wait(1) # Wait a moment before retrying

    print("[TCP Listener] Stop event received. Shutting down server socket.", flush=True)

def data_update_worker(stop_event):
    """
    This function runs in a background thread. Every 15 minutes, it
    re-calculates the dataframes and updates the global variables safely.
    """
    global data_db, fill_rate_df, drain_rate_df
    
    while not stop_event.is_set():
        print("[Update Thread] Starting scheduled data update...")
        try:
            # Perform the expensive calculations first
            new_data_db = get_cauldron_data()
            new_fill_rate_df = calculate_daily_slopes(new_data_db)
            new_drain_rate_df = calculate_daily_drain_rates(new_data_db)
            
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
        stop_event.wait(900)

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
        fill_rate_df = calculate_daily_slopes(data_db)
        drain_rate_df = calculate_daily_drain_rates(data_db)
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

@app.route("/api/live_drain_rate/<cauldron_id>/<date>")
def get_live_drain_rate_section_route(cauldron_id, date):
    with df_lock: # Acquire lock before reading
        if live_db is None:
            abort(503, description="Data is not available yet. Please try again later.")
        db = calculate_daily_drain_rates(live_db)
        result = db[(db["cauldron"] == cauldron_id) & (db["date"] == date)]
    
    if result.empty:
        abort(404, description="Drain rate data not found for the specified cauldron and date.")
    return json.dumps(result.to_dict())

@app.route("/api/live_data")
def live_data():
    try:
        return json.dumps(live_db.to_dict())
    except:
        pass

@app.route("/api/fill_rate/<cauldron_id>/<date>")
def get_fill_rate_section_route(cauldron_id, date):
    with df_lock: # Acquire lock before reading
        if fill_rate_df is None:
            abort(503, description="Data is not available yet. Please try again later.")
        result = fill_rate_df[(fill_rate_df["cauldron"] == cauldron_id) & (fill_rate_df["date"] == date)]

    if result.empty:
        abort(404, description="Fill rate data not found for the specified cauldron and date.")
    return json.dumps(result.to_dict())

@app.route("/api/get_descrepencies/")
def get_live_descrepencies():
    return verify_cauldrons(data_db)

@app.route("/api/live_get_descrepencies/")
def get_descrepencies():
    return verify_cauldrons(live_db)

@app.route("/api/live_data/update", methods=['POST'])
def update_live_data():
    """Manually update live data (for testing without hardware)"""
    try:
        data = request.get_json()
        taken_liters = float(data.get('taken_liters', 0))
        reported_liters = float(data.get('reported_liters', 0))
        discrepancy = taken_liters - reported_liters
        
        # This part of the original code relied on a 'tcp_server' object
        # that was not defined. It's better to interact with the shared
        # 'tcp_data' deque for thread safety.
        new_data = {
            'taken_liters': taken_liters,
            'reported_liters': reported_liters,
            'discrepancy': discrepancy,
            'timestamp': datetime.now().isoformat(),
            'connected': True
        }
        with tcp_data_lock:
            tcp_data.append(new_data)
        
        return jsonify(new_data)
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

@app.route("/api/tickets")
@app.route("/api/proxy/tickets")
def get_tickets_endpoint():
    """Proxy endpoint to fetch tickets from external API"""
    try:
        response = requests.get('https://hackutd2025.eog.systems/api/Tickets')
        response.raise_for_status()
        return jsonify(response.json())
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 500

@app.route("/api/live_fill_rate/<cauldron_id>")
def get_fill_rate_live(cauldron_id, date):
    with df_lock: # Acquire lock before reading
        if live_db is None:
            abort(503, description="Data is not available yet. Please try again later.")
        db = calculate_daily_slopes(live_db)
        result = db[(db["cauldron"] == cauldron_id) & (db["date"] == date)]

    if result.empty:
        abort(404, description="Fill rate data not found for the specified cauldron and date.")
    return json.dumps(result.to_dict())

# Test route to verify new endpoints are loaded
@app.route("/api/test-forecast")
def test_forecast():
    """Test route to verify forecast module is loaded."""
    return jsonify({'status': 'ok', 'message': 'Forecast endpoints are loaded'})

<<<<<<< HEAD
# ===================================================================
# SCRIPT EXECUTION
# ===================================================================

def background_task():
    """A simple function that prints a message every 5 seconds."""
    # Add flush=True here
    print("[Background Thread] The test background task is starting.", flush=True)
    while True:
        # And most importantly, add it here
        print(f"[Background Thread] Hello from the background! The time is {time.ctime()}", flush=True)
        time.sleep(5)

if __name__ == '__main__':
    
    # --- 2. Start the TCP server in a separate background thread ---
    tcp_thread = threading.Thread(target=start_tcp_server, kwargs={'host': '0.0.0.0', 'port': 3000}, daemon=True)
    tcp_thread.start()
    print("[Main Thread] TCP server thread has been started.")
    
    # --- 1. Start the background thread for periodic data updates ---
    # The 'daemon=True' flag ensures this thread will exit when the main app exits.
    update_thread = threading.Thread(target=data_update_worker, daemon=True)
    update_thread.start()
    print("[Main Thread] Data update worker thread has been started.")


    # --- 3. Run the Flask web application in the main thread ---
    # The host='0.0.0.0' makes the server accessible from other machines on your network.
    # Set debug=True for development, but turn it off for production.
    app.run(host='0.0.0.0', port=5000, debug=False)
