import re
import pandas as pd

PRYPCO_XLSX = r"C:\Users\v-mukti\Desktop\Prypco - related prompt .xlsx"

UAE_NATIVE_COMPANIES = {
    'Shory', 'YallaCompare', 'Bayzat', 'Salama', 'Takaful Emarat', 'Watania Takaful',
    'Abu Dhabi National Takaful', 'YAS.life', 'Democrance', 'PolicyBazaar UAE',
}

PRIORITY_ORDER = {'Critical': 0, 'High': 1, 'Medium': 2, 'Watch': 3}


def parse_priority_tier(raw):
    raw = str(raw)
    m = re.search(r'(Critical|High|Medium|Watch)', raw, re.IGNORECASE)
    tier = m.group(1).title() if m else None
    emoji = raw.strip().split(' ')[0] if raw.strip() else ''
    return {'raw': raw, 'tier': tier, 'emoji': emoji, 'order': PRIORITY_ORDER.get(tier, 99)}


def parse_relevance(raw):
    raw = str(raw).strip()
    if raw.startswith('★★'):
        stars, label = 2, 'Direct fit'
    elif raw.startswith('★'):
        stars, label = 1, 'Relevant'
    elif raw.lower().startswith('moderate'):
        stars, label = 0, 'Moderate'
    elif raw.lower().startswith('low'):
        stars, label = -1, 'Low'
    else:
        stars, label = 0, 'Unrated'
    text = re.sub(r'^[★\s]*(Moderate|Low)?\s*[—\-]?\s*', '', raw, flags=re.IGNORECASE).strip()
    if not text:
        text = raw
    return {'stars': stars, 'label': label, 'text': raw}


def bucket_stage(raw):
    s = str(raw)
    if re.search(r'Public|Listed', s, re.IGNORECASE):
        return 'Public'
    if re.search(r'Acquired', s, re.IGNORECASE):
        return 'Acquired'
    if re.search(r'Unicorn', s, re.IGNORECASE):
        return 'Unicorn'
    if re.search(r'Non-?profit', s, re.IGNORECASE):
        return 'Non-profit'
    if re.search(r'Early Stage', s, re.IGNORECASE):
        return 'Early Stage'
    if re.search(r'Growth', s, re.IGNORECASE):
        return 'Growth'
    if re.search(r'Series\s*A', s, re.IGNORECASE):
        return 'Series A'
    if re.search(r'Series\s*B', s, re.IGNORECASE):
        return 'Series B'
    if re.search(r'Series\s*C', s, re.IGNORECASE):
        return 'Series C'
    if re.search(r'Series\s*D', s, re.IGNORECASE):
        return 'Series D'
    if re.search(r'Series\s*E', s, re.IGNORECASE):
        return 'Series E'
    return 'Other'


def parse_time_to_launch(raw):
    s = str(raw)
    nums = [int(n) for n in re.findall(r'\d+', s)]
    midpoint = sum(nums) / len(nums) if nums else None
    return {'raw': s, 'midpointMonths': midpoint}


def normalize_vertical(name):
    return re.sub(r'\s*\([^)]*\)\s*$', '', str(name)).strip().lower()


def load_prypco_data():
    verticals_df = pd.read_excel(PRYPCO_XLSX, sheet_name='Sheet1', skiprows=3, header=None)
    verticals_df.columns = ['vertical', 'businessLine', 'howItConnects', 'valueForPrypco', 'valueForCustomer', 'priority']
    verticals_df = verticals_df.dropna(subset=['vertical'])

    verticals = []
    for _, row in verticals_df.iterrows():
        p = parse_priority_tier(row['priority'])
        verticals.append({
            'vertical': row['vertical'],
            'businessLine': row['businessLine'],
            'howItConnects': row['howItConnects'],
            'valueForPrypco': row['valueForPrypco'],
            'valueForCustomer': row['valueForCustomer'],
            'priority': p,
        })
    verticals.sort(key=lambda v: v['priority']['order'])
    vertical_norm_map = {normalize_vertical(v['vertical']): v['vertical'] for v in verticals}

    companies_df = pd.read_excel(PRYPCO_XLSX, sheet_name='Sheet2', skiprows=3, header=None)
    companies_df.columns = ['vertical', 'company', 'hqRegion', 'stage', 'description', 'relevance']
    companies_df = companies_df.dropna(subset=['company'])

    companies = []
    for i, row in companies_df.iterrows():
        rel = parse_relevance(row['relevance'])
        norm = normalize_vertical(row['vertical'])
        companies.append({
            'id': f'pc-{i}',
            'vertical': row['vertical'],
            'verticalMapMatch': vertical_norm_map.get(norm),
            'company': row['company'],
            'hqRegion': row['hqRegion'],
            'stage': row['stage'],
            'stageBucket': bucket_stage(row['stage']),
            'description': row['description'],
            'relevance': rel,
            'uaeNative': row['company'].strip() in UAE_NATIVE_COMPANIES,
        })
    companies.sort(key=lambda c: -c['relevance']['stars'])

    roadmap_df = pd.read_excel(PRYPCO_XLSX, sheet_name='Sheet3', skiprows=3, header=None)
    roadmap_df.columns = ['priority', 'vertical', 'partners', 'revenueModel', 'timeToLaunch']
    roadmap_df = roadmap_df.dropna(subset=['vertical'])

    company_names = [c['company'] for c in companies]

    roadmap = []
    for _, row in roadmap_df.iterrows():
        p = parse_priority_tier(row['priority'])
        rank_match = re.search(r'(\d+)', str(row['priority']))
        rank = int(rank_match.group(1)) if rank_match else None
        partner_names = [x.strip() for x in str(row['partners']).split(',')]
        partners = []
        for pn in partner_names:
            matched = None
            for cn in company_names:
                if cn.lower() in pn.lower():
                    matched = cn
                    break
            partners.append({'raw': pn, 'matchedCompany': matched})
        ttl = parse_time_to_launch(row['timeToLaunch'])
        roadmap.append({
            'rank': rank,
            'priority': p,
            'vertical': row['vertical'],
            'partners': partners,
            'revenueModel': row['revenueModel'],
            'timeToLaunch': ttl,
        })
    roadmap.sort(key=lambda r: r['rank'] or 999)

    return {
        'verticals': verticals,
        'companies': companies,
        'roadmap': roadmap,
        'meta': {
            'verticalCount': len(verticals),
            'companyCount': len(companies),
            'roadmapCount': len(roadmap),
            'criticalCount': sum(1 for r in roadmap if r['priority']['tier'] == 'Critical'),
            'tierCounts': {
                tier: sum(1 for v in verticals if v['priority']['tier'] == tier)
                for tier in ['Critical', 'High', 'Medium', 'Watch']
            },
            'extraCompanyVerticals': sorted(set(c['vertical'] for c in companies if c['verticalMapMatch'] is None)),
            'uaeNativeCompanies': sorted(UAE_NATIVE_COMPANIES),
        }
    }
