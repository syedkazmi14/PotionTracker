from utils import get_ticket_data
from utils import get_cauldron_data
from slope import calculate_daily_slopes, calculate_daily_drain_rates
import json

def calculate_distance(start, end, slope, generation_minutes, amounts):
    # The total generated amount is the rate * the time it was actually generating
    total_generated = slope * generation_minutes
    
    expected = (start + total_generated) - sum(amounts)
    return expected - end


    
def verify_cauldrons():
    ticket_data = get_ticket_data()
    daily_slopes = calculate_daily_slopes()
    days = ticket_data["date"].unique()   
    cauldrons = ticket_data["cauldron_id"].unique()
    cauldron_dict = { cauldron : [] for cauldron in cauldrons}
    
    for day in days:
        for cauldron in cauldrons:
                daily_ticket =  ticket_data[(ticket_data["cauldron_id"] == cauldron) & (ticket_data["date"].astype(str) == day)]
                cauldron_data = daily_slopes[(daily_slopes["cauldron"] == cauldron) & (daily_slopes["date"].astype(str) == day)]
                if not daily_ticket.empty and  not cauldron_data.empty:
                    daily_slope = cauldron_data["average_section_slope"].item()
                    start = cauldron_data["start_of_day_amount"].item()
                    end = cauldron_data["end_of_day_amount"].item()
                    total_gen_time = cauldron_data["total_generation_minutes"].item() 
                    descrepency = calculate_distance(start, end, total_gen_time, daily_slope, daily_ticket["amount_collected"].tolist())
                    cauldron_dict[cauldron].append({"date" : day, "descrepency" : descrepency})

    return json.dumps(cauldron_dict)
