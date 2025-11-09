from app import app, start_tcp_server, data_update_worker, initial_load
import threading
from waitress import serve
import signal
import time

# Create a threading.Event object to signal shutdown to all threads.
stop_event = threading.Event()

def graceful_shutdown(signum, frame):
    """Signal handler to initiate a graceful shutdown."""
    print("\n[Main Thread] Shutdown signal received! Notifying all threads...", flush=True)
    stop_event.set()

if __name__ == '__main__':
    # Register the signal handlers for Ctrl+C (SIGINT) and kill (SIGTERM).
    signal.signal(signal.SIGINT, graceful_shutdown)
    signal.signal(signal.SIGTERM, graceful_shutdown)

    # Perform the initial data load before starting any threads.
    #initial_load() # Uncomment this when your get_cauldron_data() function is ready.

    print("[Main Thread] Starting background threads...", flush=True)
    
    # --- Create worker threads ---
    # These are NON-DAEMONIC because we want to wait for them to finish cleanly.
    tcp_thread = threading.Thread(target=start_tcp_server, args=(stop_event,))
    #update_thread = threading.Thread(target=data_update_worker, args=(stop_event,))
    
    worker_threads = [tcp_thread]#, update_thread]

    # --- Create the server thread ---
    # This thread IS DAEMONIC. This means it will be abruptly terminated when the
    # main thread exits, which is acceptable since the workers will have already shut down.
    server_thread = threading.Thread(target=serve, args=(app,), kwargs={'host': '0.0.0.0', 'port': 5000}, daemon=True)

    # --- Start all threads ---
    for t in worker_threads:
        t.start()
    server_thread.start()
    
    print("[Main Thread] All threads started. Application is running.", flush=True)
    print("[Main Thread] Press Ctrl+C to exit gracefully.", flush=True)

    # --- The main thread now waits for the shutdown signal ---
    # The .wait() call is a clean, non-busy way to block until the event is set.
    stop_event.wait()

    # --- Shutdown sequence begins once stop_event is set ---
    print("[Main Thread] Shutting down worker threads...", flush=True)
    
    # Wait for the non-daemonic worker threads to finish their work.
    for t in worker_threads:
        t.join() # This will now work correctly.
        
    print("[Main Thread] All worker threads have finished. Application exiting.", flush=True)
