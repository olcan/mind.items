#logger/summary #_logger
- Logged `<<event_log().length>>` events in `<<event_log_items().length>>` items.
- Last 5 events:
<< event_log_block({limit:5}) >>
- Event stats by keyword:
<< event_log_stats_table(event_log_keywords().concat(undefined).concat('')) >>