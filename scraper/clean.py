"""Post-process verbs.json: deduplicate, remove empties, sort by frequency."""
import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

PRIORITY = [
    'go','come','say','speak','see','know','want','give','take','do','make',
    'write','read','eat','drink','hear','understand','love','help','ask','find',
    'use','start','stop','open','close','send','receive','sit','stand',
    'walk','run','work','sleep','learn','buy','think','bring','carry',
    'tell','show','leave','arrive','return','wait','try','need','keep',
    'get','put','let','play','call','meet','pay','spend','grow','turn',
    'remember','forget','decide','agree','win','lose','fight',
    'die','live','happen','stay','appear','change',
]

PATCH = [
  {'id':'go',    'infinitive':'წასვლა',   'english':'go',    'frequency_rank':0, 'conjugations':{'present':{'1sg':'მივდივარ','2sg':'მიდიხარ','3sg':'მიდის','1pl':'მივდივართ','2pl':'მიდიხართ','3pl':'მიდიან'},'imperfect':{'1sg':'მივდიოდი','2sg':'მიდიოდი','3sg':'მიდიოდა','1pl':'მივდიოდით','2pl':'მიდიოდით','3pl':'მიდიოდნენ'},'future':{'1sg':'წავალ','2sg':'წახვალ','3sg':'წავა','1pl':'წავალთ','2pl':'წახვალთ','3pl':'წავლენ'},'aorist':{'1sg':'წავედი','2sg':'წახვედი','3sg':'წავიდა','1pl':'წავედით','2pl':'წახვედით','3pl':'წავიდნენ'},'optative':{'1sg':'წავიდე','2sg':'წახვიდე','3sg':'წავიდეს','1pl':'წავიდეთ','2pl':'წახვიდეთ','3pl':'წავიდნენ'},'perfect':{'1sg':'წასულვარ','2sg':'წასულხარ','3sg':'წასულა','1pl':'წასულვართ','2pl':'წასულხართ','3pl':'წასულან'}}},
  {'id':'say',   'infinitive':'თქმა',     'english':'say',   'frequency_rank':0, 'conjugations':{'present':{'1sg':'ვამბობ','2sg':'ამბობ','3sg':'ამბობს','1pl':'ვამბობთ','2pl':'ამბობთ','3pl':'ამბობენ'},'imperfect':{'1sg':'ვამბობდი','2sg':'ამბობდი','3sg':'ამბობდა','1pl':'ვამბობდით','2pl':'ამბობდით','3pl':'ამბობდნენ'},'future':{'1sg':'ვიტყვი','2sg':'იტყვი','3sg':'იტყვის','1pl':'ვიტყვით','2pl':'იტყვით','3pl':'იტყვიან'},'aorist':{'1sg':'ვთქვი','2sg':'თქვი','3sg':'თქვა','1pl':'ვთქვით','2pl':'თქვით','3pl':'თქვეს'},'optative':{'1sg':'ვთქვა','2sg':'თქვა','3sg':'თქვას','1pl':'ვთქვათ','2pl':'თქვათ','3pl':'თქვან'},'perfect':{'1sg':'მითქვამს','2sg':'გითქვამს','3sg':'უთქვამს','1pl':'გვითქვამს','2pl':'გითქვამთ','3pl':'უთქვამთ'}}},
  {'id':'speak', 'infinitive':'ლაპარაკი', 'english':'speak', 'frequency_rank':0, 'conjugations':{'present':{'1sg':'ვლაპარაკობ','2sg':'ლაპარაკობ','3sg':'ლაპარაკობს','1pl':'ვლაპარაკობთ','2pl':'ლაპარაკობთ','3pl':'ლაპარაკობენ'},'imperfect':{'1sg':'ვლაპარაკობდი','2sg':'ლაპარაკობდი','3sg':'ლაპარაკობდა','1pl':'ვლაპარაკობდით','2pl':'ლაპარაკობდით','3pl':'ლაპარაკობდნენ'},'future':{'1sg':'ვილაპარაკებ','2sg':'ილაპარაკებ','3sg':'ილაპარაკებს','1pl':'ვილაპარაკებთ','2pl':'ილაპარაკებთ','3pl':'ილაპარაკებენ'},'aorist':{'1sg':'ვილაპარაკე','2sg':'ილაპარაკე','3sg':'ილაპარაკა','1pl':'ვილაპარაკეთ','2pl':'ილაპარაკეთ','3pl':'ილაპარაკეს'},'optative':{'1sg':'ვილაპარაკო','2sg':'ილაპარაკო','3sg':'ილაპარაკოს','1pl':'ვილაპარაკოთ','2pl':'ილაპარაკოთ','3pl':'ილაპარაკონ'},'perfect':{'1sg':'მილაპარაკია','2sg':'გილაპარაკია','3sg':'ულაპარაკია','1pl':'გვილაპარაკია','2pl':'გილაპარაკიათ','3pl':'ულაპარაკიათ'}}},
  {'id':'hear',  'infinitive':'მოსმენა',  'english':'hear',  'frequency_rank':0, 'conjugations':{'present':{'1sg':'ვუსმენ','2sg':'უსმენ','3sg':'უსმენს','1pl':'ვუსმენთ','2pl':'უსმენთ','3pl':'უსმენენ'},'imperfect':{'1sg':'ვუსმენდი','2sg':'უსმენდი','3sg':'უსმენდა','1pl':'ვუსმენდით','2pl':'უსმენდით','3pl':'უსმენდნენ'},'future':{'1sg':'მოვისმენ','2sg':'მოისმენ','3sg':'მოისმენს','1pl':'მოვისმენთ','2pl':'მოისმენთ','3pl':'მოისმენენ'},'aorist':{'1sg':'მოვისმინე','2sg':'მოისმინე','3sg':'მოისმინა','1pl':'მოვისმინეთ','2pl':'მოისმინეთ','3pl':'მოისმინეს'},'optative':{'1sg':'მოვისმინო','2sg':'მოისმინო','3sg':'მოისმინოს','1pl':'მოვისმინოთ','2pl':'მოისმინოთ','3pl':'მოისმინონ'},'perfect':{'1sg':'მომისმენია','2sg':'მოგისმენია','3sg':'მოუსმენია','1pl':'მოგვისმენია','2pl':'მოგისმენიათ','3pl':'მოუსმენიათ'}}},
]

OUT = 'C:/Users/Dinara/Georgian Language app/data/verbs.json'

with open(OUT, encoding='utf-8') as f:
    verbs = json.load(f)

print(f'Raw: {len(verbs)}')

# Remove empties
verbs = [v for v in verbs if v.get('infinitive','').strip() and v.get('english','').strip()]
print(f'After removing empties: {len(verbs)}')

# Patch in missing key verbs
inf_set = {v['infinitive'] for v in verbs}
for p in PATCH:
    if p['infinitive'] not in inf_set:
        verbs.append(p)
        print(f'  Patched: {p["english"]} ({p["infinitive"]})')

# Sort by priority then original rank
def sort_key(v):
    eng = v.get('english','').lower().strip()
    try:
        return PRIORITY.index(eng)
    except ValueError:
        return len(PRIORITY) + v.get('frequency_rank', 9999)

verbs.sort(key=sort_key)

# Deduplicate by infinitive (keep first = highest priority)
seen_inf = set()
clean = []
for v in verbs:
    inf = v['infinitive'].strip()
    if inf not in seen_inf:
        seen_inf.add(inf)
        clean.append(v)

for i, v in enumerate(clean):
    v['frequency_rank'] = i + 1

print(f'Final: {len(clean)} verbs')
print()
print('Top 20:')
for v in clean[:20]:
    p = v['conjugations'].get('present', {})
    print(f'  {v["frequency_rank"]:3d}. {v["infinitive"]:22} = {v["english"]:20}  1sg={p.get("1sg","?")}')

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(clean, f, ensure_ascii=False, indent=2)

print(f'\nSaved to {OUT}')
