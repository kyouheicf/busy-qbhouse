/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */
//import HTML from './gchartapi.html';
import puppeteer from '@cloudflare/puppeteer'

function padTwoDigits(num) {
	return num.toString().padStart(2, "0");
}

function dateInYyyyMmDdHhMmSs(date, dateDiveder = "-") {
	// :::: Exmple Usage ::::
	// The function takes a Date object as a parameter and formats the date as YYYY-MM-DD hh:mm:ss.
	// 👇️ 2023-04-11 16:21:23 (yyyy-mm-dd hh:mm:ss)
	//console.log(dateInYyyyMmDdHhMmSs(new Date()));

	//  👇️️ 2025-05-04 05:24:07 (yyyy-mm-dd hh:mm:ss)
	// console.log(dateInYyyyMmDdHhMmSs(new Date('May 04, 2025 05:24:07')));
	// Date divider
	// 👇️ 01/04/2023 10:20:07 (MM/DD/YYYY hh:mm:ss)
	// console.log(dateInYyyyMmDdHhMmSs(new Date(), "/"));
	return (
		[
			date.getFullYear(),
			padTwoDigits(date.getMonth() + 1),
			padTwoDigits(date.getDate()),
		].join(dateDiveder) +
		" " +
		[
			padTwoDigits(date.getHours()),
			padTwoDigits(date.getMinutes()),
			'00',
		].join(":")
	);
}

async function triggerEvent(event, render, database) {
	// Fetch some data
	//console.log('cron processed: event cron =', event.cron);
	//console.log('cron processed: event type =', event.type);
	//console.log('cron processed: event scheduledTime =', event.scheduledTime);
	//const date = new Date(event.scheduledTime)
	//console.log('cron processed: event scheduledTime date =', date);
	const jstNow = new Date(Date.now() + ((new Date().getTimezoneOffset() + (9 * 60)) * 60 * 1000))//.toLocaleString({ timeZone: 'Asia/Tokyo' });
	console.log('cron processed: event scheduledTime date jst =', dateInYyyyMmDdHhMmSs(jstNow));

	const browser = await puppeteer.launch(render);
	const page = await browser.newPage();

	//await page.setViewport({
	//	width: 1920,
	//	height: 1080,
	//	deviceScaleFactor: 1,
	//});

	await page.goto("https://www.qbhouse.co.jp/search/488", {
		//一定時間ネットワーク通信のないことで完了を判定する
		waitUntil: "load",
		//waitUntil: "networkidle2", //コネクション数が2個以下である状態が500ミリ秒続いたとき
		//timeout: 0 //0を指定するとタイムアウト無し
	});

	const html = await page.$eval('#salon_info > div > div:nth-child(4) > div.waiting_wrap > dl.number > dd', node => node.innerText);
	console.log(`shop status in html === ${html}`)

	if (html != '開店前' && html != '受付終了') {
		console.log('D1 data write task is initiated...')
		console.log(`shop waiting people number in html === ${html.slice(0, 1)}`)
		// D1 Write jstNow.toLocaleString() , html.slice(0, 1)
		await database
			.prepare('INSERT INTO WaitPeople (DateTime, WaitPeopleNumber) VALUES (?1, ?2)')
			.bind(dateInYyyyMmDdHhMmSs(jstNow), html.slice(0, 1))
			.run()
		console.log('D1 data write task is done!')
	}
	await browser.close();
}

export default {
	async scheduled(event, env, ctx) {
		ctx.waitUntil(triggerEvent(event, env.MYBROWSER, env.DB));
	},
	async fetch(request, env, ctx) {
		//[[11, 20, 0], 3],
		//[[11, 25, 0], 5],
		//?date=2023-10-02
		const { searchParams } = new URL(request.url)
		let date = searchParams.get('date')
		console.log(`date === ${date}`)
		const stmtstring = `SELECT substr(DateTime,12,2) AS hour, substr(DateTime,15,2) AS min, substr(DateTime,18,3) AS sec, WaitPeopleNumber as num FROM WaitPeople WHERE DATE(DateTime) = '${date}'`
		console.log(`stmtstring === ${stmtstring}`)
		const stmt = env.DB.prepare(stmtstring);
		const { results } = await stmt.all();
		console.log(results);
		//let json_after = results.map(row => {
		//	return ['[' + '[' + row.hour, row.min, row.sec + ']', row.num + ']']
		//});
		//const data = {
		//	json_after,
		//};

		//const json = JSON.stringify(json_after, null, 2);
		const json = JSON.stringify(results, null, 2);

		const corsHeaders = {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET,OPTIONS",
			"Access-Control-Max-Age": "86400",
		};

		async function handleOptions(request) {
			if (
				request.headers.get('Origin') !== null &&
				request.headers.get('Access-Control-Request-Method') !== null &&
				request.headers.get('Access-Control-Request-Headers') !== null
			) {
				// Handle CORS preflight requests.
				return new Response(null, {
					headers: {
						...corsHeaders,
						'Access-Control-Allow-Headers': request.headers.get(
							'Access-Control-Request-Headers'
						),
					},
				});
			} else {
				// Handle standard OPTIONS request.
				return new Response(null, {
					headers: {
						Allow: 'GET, OPTIONS',
					},
				});
			}
		}

		if (request.method === 'OPTIONS') {
			// Handle CORS preflight requests
			return handleOptions(request);
		} else if (
			request.method === 'GET'
		) {
			// Handle requests to the API server
			return new Response(json, {
				headers: {
					"content-type": "application/json;charset=UTF-8",
					'Access-Control-Allow-Origin': 'https://busy-qbhouse.pages.dev'
				},
			});
		} else {
			return new Response(null, {
				status: 405,
				statusText: 'Method Not Allowed',
			});
		}
		//const D1HTML = HTML.replace(/D1Data/, `${json_after}`);
		//return new Response(D1HTML, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
	}
};