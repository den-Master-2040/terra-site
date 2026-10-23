import asyncio, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":1200,"height":1700}, device_scale_factor=1)
        errs=[]; pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
        await pg.goto("file://" + OUT + "/assets/js/_poster.html")
        await pg.wait_for_function("document.querySelectorAll('[data-rendered]').length==2", timeout=120000)
        await pg.locator("#a").screenshot(path=OUT+"/assets/img/motor.png", omit_background=True, timeout=120000)
        await pg.locator("#b").screenshot(path=OUT+"/assets/img/motor-exploded.png", omit_background=True, timeout=120000)
        await b.close(); print("errors:", errs)
asyncio.run(main())
