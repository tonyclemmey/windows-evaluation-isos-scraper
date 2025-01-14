"use strict";

// install dependencies:
//
//      npm install
//
// execute:
//
// NB to troubleshoot uncomment $env:DEBUG and set {headless:false,dumpio:true} in main.js.
//
//      $env:DEBUG = 'puppeteer:*'
//      node main.js

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";

async function getEvaluationIsos(page, filterRegExp, url) {
    console.log("scraping", url);

    await page.goto(url);

    return await page.evaluate(async (filterRegExp) => {
        var data = [];
        const els = document.querySelectorAll("a[aria-label*=' ISO '][aria-label*=' 64-bit '][aria-label*='(en-US)']")
        // const els = document.querySelectorAll('a[data-bi-cn*="iso-dl"][aria-label*=" ISO "][aria-label*=" 64-bit "][aria-label*="(en-US)"], a[data-bi-cn*="exe-dl"][data-bi-ecn*="64-bit edition"][aria-label*="64-bit edition download"]')
        for (const el of els) {
            const label = el.getAttribute("aria-label");
            if (filterRegExp && !label.match(filterRegExp)) {
                continue;
            }
            const name = label
                .toLowerCase()
                .replace(/\s*(download|server|iso|ltsc|enterprise|64-bit|\(en-US\))\s*/ig, " ")
                .replace(/[^a-z0-9]+/ig, " ")
                .trim()
                .replace(" ", "-");
            const url = el.getAttribute("href");
            data.push({
                name: name,
                url: url,
            });
        }
        return data;
    }, filterRegExp);
}

async function main(name) {
    console.log("launching");
    const browser = await puppeteer.launch({
        headless: true,
        dumpio: false,
        headless: "new",
    });
    try {
        console.log("getting the browser version");
        console.log("running under", await browser.version());

        console.log("creating a new browser page");
        const page = await browser.newPage();

        console.log("lowering the needed bandwidth to scrape the site");
        await page.setRequestInterception(true);
        page.on(
            "request",
            request => {
                if (request.resourceType() === "document") {
                    //console.log("downloading", request.url());
                    request.continue();
                } else {
                    request.abort();
                }
            }
        );

        var targets = {
            "windows-10":   [/ltsc/i, "https://www.microsoft.com/en-gb/evalcenter/download-windows-10-enterprise"],
            "windows-11":   [null,    "https://www.microsoft.com/en-gb/evalcenter/download-windows-11-enterprise"],
            "windows-2019": [null,    "https://www.microsoft.com/en-gb/evalcenter/download-windows-server-2019"],
            "windows-2022": [null,    "https://www.microsoft.com/en-gb/evalcenter/download-windows-server-2022"],
            // "sql-2019":     [null,    "https://www.microsoft.com/en-gb/evalcenter/download-sql-server-2019"],
            // "sql-2022":     [null,    "https://www.microsoft.com/en-gb/evalcenter/download-sql-server-2022"],
        };
        const target = targets[name];
        if (!target) {
            throw `unknown target ${name}`;
        }
        const data = {};
        const isos = await getEvaluationIsos(page, ...target);
        for (const iso of isos) {
            const response = await fetch(iso.url, {method: 'HEAD'});
            data[iso.name] = response.url;
        }

        const scrapePath = `data/${name}-scrape.json`;
        console.log(`saving to ${scrapePath}`);
        fs.mkdirSync(path.dirname(scrapePath), {recursive: true});
        fs.writeFileSync(scrapePath, JSON.stringify(data, null, 4));
    } finally {
        await browser.close();
    }
}

await main(...process.argv.slice(2));
