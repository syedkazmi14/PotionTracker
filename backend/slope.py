import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression
from utils import get_cauldron_data



def calculate_daily_slopes():
    df = get_cauldron_data()
    # Step 1: Ensure the 'time' column is in the correct datetime format. This is critical.
    print("Checking 'time' column data type...")
    if 'datetime64' not in str(df['time'].dtype):
        print("Converting 'time' column from numeric to datetime...")
        df['time'] = pd.to_datetime(df['time'], unit='s')
    else:
        print("'time' column is already in the correct datetime format.")

    # Step 2: Create a 'date' column for daily grouping.
    df['date'] = df['time'].dt.date

    # Step 3: Get the list of cauldron columns to analyze.
    cauldron_columns = [col for col in df.columns if 'cauldron' in col]


    # --- Step 4: Find every individual section and calculate its metrics ---
    all_section_results = []

    print("\nProcessing all cauldrons to find positive/flat sections...")
    for cauldron_name in cauldron_columns:
        # Identify non-decreasing sections (where the level is rising or flat).
        is_non_decreasing = df[cauldron_name].diff() >= 0

        # Assign a unique ID to each continuous block of non-decreasing values.
        blocks = (is_non_decreasing != is_non_decreasing.shift()).cumsum()

        # Filter for only the rows that are part of a non-decreasing section.
        non_decreasing_df = df[is_non_decreasing]

        # Group the filtered rows by their unique block ID to isolate each section.
        sections = non_decreasing_df.groupby(blocks)

        # Loop through each individual section.
        for _, section in sections:
            # A valid section needs at least two points to fit a line.
            if len(section) > 1:
                # Prepare data for linear regression.
                # X: time (as numeric seconds from the start of the section)
                time_numeric = (section['time'] - section['time'].min()).dt.total_seconds().values.reshape(-1, 1)
                # y: cauldron level
                levels = section[cauldron_name].values

                # Fit the linear regression model for this specific section.
                model = LinearRegression()
                model.fit(time_numeric, levels)

                # Get R² and the slope (in level/minute) for this section.
                r_squared = model.score(time_numeric, levels)
                slope_per_minute = model.coef_[0] * 60
                section_duration_minutes = (section['time'].max() - section['time'].min()).total_seconds() / 60
                # Store the result, linking it to the specific date of the section.
                all_section_results.append({
                    'cauldron': cauldron_name,
                    'date': section['date'].iloc[0],
                    'section_slope_per_min': slope_per_minute,
                    'section_r_squared': r_squared,
                    'section_duration_minutes': section_duration_minutes # Add duration
                })

    print("Finished processing individual sections.")

    # --- Step 5: Aggregate the individual section results by day ---

    # Create a DataFrame from the results of all individual sections.
    sections_df = pd.DataFrame(all_section_results)

    print("\nAggregating slope results by day...")
    # Group by cauldron and date, then calculate the average for each group.
    daily_summary = sections_df.groupby(['cauldron', 'date']).agg(
        average_section_slope=('section_slope_per_min', 'mean'),
        average_section_r_squared=('section_r_squared', 'mean'),
        section_count=('section_slope_per_min', 'size'),
        total_generation_minutes=('section_duration_minutes', 'sum') # Sum up the durations
    ).reset_index()

    # --- Step 6: Get the start and end of day amounts for each cauldron ---
    print("\nCalculating start and end of day amounts...")

    # To easily process all cauldrons, we "unpivot" the DataFrame from wide to long format.
    df_long = df.melt(
        id_vars=['date', 'time'],
        value_vars=cauldron_columns,
        var_name='cauldron',
        value_name='level'
    )

    # IMPORTANT: Sort by time to ensure 'first' and 'last' aggregations are correct.
    df_long = df_long.sort_values('time')

    # Group by cauldron and date, then grab the first and last level for that day.
    daily_levels = df_long.groupby(['cauldron', 'date']).agg(
        start_of_day_amount=('level', 'first'),
        end_of_day_amount=('level', 'last')
    ).reset_index()


    # --- Step 7: Merge the slope summary with the daily level amounts ---
    print("Merging all daily data...")
    final_summary = pd.merge(
        daily_summary,
        daily_levels,
        on=['cauldron', 'date'],
        how='left' # Use a left merge to keep all slope data.
    )


    # --- Step 8: Display the final daily summary ---
    print("\n--- Daily Averages of Individual Section Slopes and R-Squared ---")
    # Set display options to ensure all rows are shown for a complete view.
    pd.set_option('display.max_rows', None)
    print(final_summary)
    return final_summary
