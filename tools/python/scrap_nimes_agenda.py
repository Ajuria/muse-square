from __future__ import annotations

from playwright_stealth import stealth
from playwright.sync_api import sync_playwright, Page
from bs4 import BeautifulSoup
import pandas as pd
import re
import time
import requests
from urllib.parse import urljoin
from datetime import datetime, UTC

BASE_URL = "https://www.nimes.fr/agenda"
SITE_ROOT = "https://www.nimes.fr"
OUTPUT_FILE = "nimes_events_raw.csv"

DETAIL_WAIT_MS = 800
DETAIL_SLEEP_S = 0.2

DEBUG = False


def clean_text(text: str) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", text).strip()


def maybe_accept_cookies(page: Page) -> None:
    candidates = [
        "#orejime button:has-text('Tout accepter')",
        ".orejime-Notice button:has-text('Tout accepter')",
        "button:has-text('Tout accepter')",
    ]
    for sel in candidates:
        loc = page.locator(sel).first
        try:
            if loc.count() > 0 and loc.is_visible():
                loc.click(timeout=2000)
                page.wait_for_timeout(400)
                return
        except Exception:
            continue


def parse_event_detail(page: Page, url: str) -> dict | None:
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_timeout(2500)
    page.wait_for_timeout(DETAIL_WAIT_MS)
    maybe_accept_cookies(page)

    soup = BeautifulSoup(page.content(), "html.parser")
    full_text = soup.get_text("\n", strip=True)

    h1 = soup.find("h1")
    title = clean_text(h1.get_text()) if h1 else ""

    category = ""
    if h1:
        prev = h1.find_previous(["p", "div", "span"])
        if prev:
            txt = clean_text(prev.get_text())
            if 0 < len(txt) < 120:
                category = txt

    chapo = ""
    if h1:
        nxt = h1.find_next("p")
        if nxt:
            chapo = clean_text(nxt.get_text())

    venue_name = ""
    venue_match = re.search(r"Bibliothèque.*?Nîmes", full_text)
    if venue_match:
        venue_name = clean_text(venue_match.group())

    date_display = ""
    m = re.search(r"Du\s+\d{1,2}\s+\w+\s+\d{4}\s+au\s+\d{1,2}\s+\w+\s+\d{4}", full_text)
    if m:
        date_display = clean_text(m.group())

    date_start_raw = ""
    date_end_raw = ""
    dates = re.findall(r"\d{2}/\d{2}/\d{4}", full_text)
    if len(dates) >= 1:
        date_start_raw = dates[0]
    if len(dates) >= 2:
        date_end_raw = dates[1]

    quickview_block = ""
    quickview_dates = ""
    quickview_periods = ""
    quickview_access = ""

    if "En un clin d" in full_text:
        split = re.split(r"En un clin d['’]oeil\s*!", full_text, flags=re.IGNORECASE)
        if len(split) > 1:
            quickview_block = clean_text(split[1][:1000])

        m_dates = re.search(r"Du\s+\d{2}/\d{2}/\d{4}.*?\.", quickview_block)
        if m_dates:
            quickview_dates = clean_text(m_dates.group())

        m_periods = re.search(r"Périodes\s*(.*?)\n", quickview_block)
        if m_periods:
            quickview_periods = clean_text(m_periods.group(1))

        m_access = re.search(r"Accès.*?\.", quickview_block)
        if m_access:
            quickview_access = clean_text(m_access.group())

    paragraphs: list[str] = []
    for p in soup.find_all("p"):
        txt = clean_text(p.get_text())
        if len(txt) > 80:
            paragraphs.append(txt)
    description_long = " ".join(paragraphs)

    address_full = ""
    postal_code = ""
    city = ""

    address_match = re.search(r"\d+\s+.*?\n?\d{5}\s+Nîmes", full_text)
    if address_match:
        address_full = clean_text(address_match.group())
        cp_match = re.search(r"\d{5}", address_full)
        if cp_match:
            postal_code = cp_match.group()
            city = "Nîmes"

    google_maps_url = ""
    for a in soup.select("a[href]"):
        href = a.get("href")
        if href and "google.com/maps" in href:
            google_maps_url = href
            break

    practical_info = ""
    if "Informations pratiques" in full_text:
        split = re.split(r"Informations pratiques", full_text, flags=re.IGNORECASE)
        if len(split) > 1:
            practical_info = clean_text(split[1][:1000])

    return {
        "source_url": url,
        "scraped_at": datetime.now(UTC).isoformat(),
        "category": category,
        "title": title,
        "chapo": chapo,
        "venue_name": venue_name,
        "date_display": date_display,
        "date_start_raw": date_start_raw,
        "date_end_raw": date_end_raw,
        "quickview_block": quickview_block,
        "quickview_dates": quickview_dates,
        "quickview_periods": quickview_periods,
        "quickview_access": quickview_access,
        "description_long": description_long,
        "address_full": address_full,
        "postal_code": postal_code,
        "city": city,
        "google_maps_url": google_maps_url,
        "practical_info": practical_info,
    }


import requests

def main():
    from pathlib import Path
    USER_DATA_DIR = str(Path.home() / ".pw_real_profile")

    all_events = []
    seen = set()

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            USER_DATA_DIR,
            headless=False,
            channel="chrome",
            locale="fr-FR",
        )

        page = context.new_page()

        # MANUALLY solve Cloudflare once if needed
        page.goto("https://www.nimes.fr/agenda")
        input("Solve challenge manually if shown, then press ENTER...")

        for page_index in [1]:
            listing_url = f"https://www.nimes.fr/agenda?tx_solr[page]={page_index}&tx_solr[view]=LIST"
            print("Visiting:", listing_url)

            page.goto(listing_url)
            page.wait_for_timeout(8000)  # human pace
            print(page.content()[:2000])

            soup = BeautifulSoup(page.content(), "html.parser")
            links = soup.select("h2 a[href]")

            for a in links:
                href = a.get("href")
                if not href:
                    continue

                detail_url = urljoin("https://www.nimes.fr", href)
                if detail_url in seen:
                    continue

                seen.add(detail_url)
                print(" ->", detail_url)

                page.goto(detail_url)
                page.wait_for_timeout(5000)

                # extract minimal info
                detail_soup = BeautifulSoup(page.content(), "html.parser")
                h1 = detail_soup.find("h1")
                title = h1.get_text(strip=True) if h1 else ""

                all_events.append({
                    "source_url": detail_url,
                    "title": title,
                })

                time.sleep(5)  # slow down

        context.close()

    pd.DataFrame(all_events).to_csv("nimes_events_raw.csv", index=False)

if __name__ == "__main__":
    main()