from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("https://www.nimes.fr/agenda")
    print(page.content()[:2000])
    browser.close()