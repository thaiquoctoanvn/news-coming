-- U.S. policy rate and economy (charts page): FED target range, CPI, PCE, PPI (year-over-year)
-- and the unemployment rate, monthly, from FRED (free key already used for the calendar).
-- Series live in config, so more FRED series can be added without code.

insert into public.data_modules (topic_id, id, connector, name_vi, config) values
  ('macro_finance', 'us_macro', 'fred_series', 'Lãi suất FED & kinh tế Mỹ',
    '{
      "months": 36,
      "series": {
        "US_FED_LOW":  {"id": "DFEDTARL", "frequency": "m", "aggregation": "eop"},
        "US_FED_HIGH": {"id": "DFEDTARU", "frequency": "m", "aggregation": "eop"},
        "US_CPI_YOY":  {"id": "CPIAUCSL", "units": "pc1"},
        "US_PCE_YOY":  {"id": "PCEPI", "units": "pc1"},
        "US_PPI_YOY":  {"id": "PPIFIS", "units": "pc1"},
        "US_UNRATE":   {"id": "UNRATE"}
      }
    }')
on conflict do nothing;
