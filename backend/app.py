from flask import Flask, jsonify, abort
from slope import calculate_daily_drain_rates, calculate_daily_slopes
from utils import get_cauldron_data
from ticket_tracker import verify_cauldrons
from pathlib import Path
import pandas as pd
import json

app = Flask(__name__)

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
