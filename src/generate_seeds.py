#!/usr/bin/env python3
import urllib.request, json, csv

REGIONS = ["11", "76", "93"]
BASE = "https://geo.api.gouv.fr/communes"
FIELDS = "code,nom,codeRegion,codesPostaux,centre"

rows, seen = [], set()
for reg in REGIONS:
    url = f"{BASE}?codeRegion={reg}&fields={FIELDS}&format=json"
    with urllib.request.urlopen(url, timeout=120) as r:
        for c in json.load(r):
            code = c.get("code")
            if code and code not in seen:
                seen.add(code)
                rows.append(c)

with open("city_map.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["insee_city_id","city_name","region_code","zip_code","location_uid","active_flag"])
    for c in rows:
        zip_code = (c.get("codesPostaux") or [""])[0]
        w.writerow([c["code"], c.get("nom",""), c.get("codeRegion",""), zip_code, c["code"], "TRUE"])

with open("communes_coords.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["city_id","location_uid","latitude","longitude"])
    for c in rows:
        ctr = c.get("centre")
        if not ctr:
            continue
        zip_code = (c.get("codesPostaux") or [""])[0]
        location_uid = f"{c['code']}_{zip_code}"
        lon, lat = ctr["coordinates"][0], ctr["coordinates"][1]
        w.writerow([c["code"], location_uid, lat, lon])

# departments_map — exhaustif sur les 3 régions
dept_rows, dseen = [], set()
for reg in REGIONS:
    url = f"https://geo.api.gouv.fr/regions/{reg}/departements?fields=code,nom,codeRegion"
    with urllib.request.urlopen(url, timeout=60) as r:
        for d in json.load(r):
            code = d.get("code")
            if code and code not in dseen:
                dseen.add(code)
                dept_rows.append(d)

with open("departments_map.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["department_code_insee", "department_name_official", "region_code_insee"])
    for d in dept_rows:
        w.writerow([d["code"], d.get("nom", ""), d.get("codeRegion", "")])
print(f"{len(dept_rows)} departments")

print(f"{len(rows)} communes")