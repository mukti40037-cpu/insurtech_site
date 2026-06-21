import sqlite3
import json

conn = sqlite3.connect(r"C:\Users\v-mukti\Documents\insurtech_dashboard\insurtech.db")
conn.row_factory = sqlite3.Row

rows = conn.execute('SELECT * FROM companies').fetchall()
companies = []
for r in rows:
    d = dict(r)
    companies.append({
        'id': d.get('Company ID'),
        'name': d.get('Companies'),
        'website': d.get('Website'),
        'description': d.get('Description'),
        'segment': d.get('Primary Segment'),
        'segment2': d.get('Secondary Segment'),
        'businessModel': d.get('Business Model'),
        'geo': d.get('Geography Region'),
        'hq': d.get('HQ Location'),
        'yearFounded': d.get('Year Founded'),
        'capitalIntensity': d.get('Capital Intensity'),
        'revenueModel': d.get('Revenue Model'),
        'targetCustomer': d.get('Target Customer'),
        'gtm': d.get('Go-to-Market Motion'),
        'moat': d.get('Moat'),
        'strategyNotes': d.get('Strategy Notes'),
        'ticker': d.get('ticker'),
        'tickerSource': d.get('ticker_source'),
        'tickerNote': d.get('ticker_note'),
        'totalRaised': d.get('Total Raised'),
        'ownershipStatus': d.get('Ownership Status'),
    })

with open(r"C:\Users\v-mukti\Documents\insurtech_site\data\companies.json", 'w', encoding='utf-8') as f:
    json.dump(companies, f, ensure_ascii=False)

print(f"Exported {len(companies)} companies")
public_count = sum(1 for c in companies if c['ticker'])
print(f"Public (ticker set): {public_count}")
print(f"Private: {len(companies) - public_count}")
