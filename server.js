const express = require("express");
const session = require("express-session");
const initSqlJs = require("sql.js");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: false }));

app.use(
	session({
		secret: "web2-demo-tajni-kljuc",
		resave: false,
		saveUninitialized: true,
		cookie: { httpOnly: true, sameSite: "lax" },
	}),
);

const config = {
	sqli: true, //SQL Injection ukljucen?
	csrf: true, //CSRF ukljucen?
};

function ensureAccount(req) {
	if (!req.session.account) {
		req.session.account = { username: "demo", email: "demo@fer.hr" };
		req.session.csrfToken =
			Math.random().toString(36).slice(2) + Date.now().toString(36);
	}
}

let db;
function rawQuery(sql) {
	const res = db.exec(sql);
	if (!res.length) return [];
	const { columns, values } = res[0];
	return values.map((row) =>
		Object.fromEntries(columns.map((c, i) => [c, row[i]])),
	);
}

function paramQuery(sql, params) {
	const stmt = db.prepare(sql);
	stmt.bind(params);
	const rows = [];
	while (stmt.step()) rows.push(stmt.getAsObject());
	stmt.free();
	return rows;
}

function render(req, res, extra) {
	ensureAccount(req);
	const flash = req.session.flash || null;
	req.session.flash = null;
	res.render(
		"index",
		Object.assign(
			{
				config,
				account: req.session.account,
				csrfToken: req.session.csrfToken,
				messages: null,
				sql: null,
				searched: false,
				flash,
			},
			extra || {},
		),
	);
}

app.get("/", (req, res) => render(req, res));

app.post("/config/sqli", (req, res) => {
	config.sqli = req.body.enabled === "on";
	res.redirect("/");
});
app.post("/config/csrf", (req, res) => {
	config.csrf = req.body.enabled === "on";
	res.redirect("/");
});

app.get("/search", (req, res) => {
	const q = (req.query.q || "").toString();
	let rows = [];
	let sql = "";

	if (config.sqli) {
		sql = `SELECT autor, poruka, pin FROM messages WHERE autor = '${q}'`;
		try {
			rows = rawQuery(sql);
		} catch (e) {
			rows = [];
			sql += `\n-- GRESKA: ${e.message}`;
		}
	} else {
		sql = `SELECT autor, poruka, pin FROM messages WHERE autor = ?   [parametar: ${q}]`;
		rows = paramQuery(
			"SELECT autor, poruka, pin FROM messages WHERE autor = ?",
			[q],
		);
	}

	render(req, res, { messages: rows, sql, searched: true });
});

app.post("/account/email", (req, res) => {
	ensureAccount(req);
	const newEmail = (req.body.email || "").toString();

	if (config.csrf) {
		req.session.account.email = newEmail;
		req.session.flash = {
			type: "danger",
			text: `E-mail promijenjen na: ${newEmail}  (bez CSRF provjere!)`,
		};
		return res.redirect("/");
	} else {
		if (req.body._csrf && req.body._csrf === req.session.csrfToken) {
			req.session.account.email = newEmail;
			req.session.flash = {
				type: "ok",
				text: `E-mail promijenjen na: ${newEmail}  (uz ispravan CSRF token)`,
			};
		} else {
			req.session.flash = {
				type: "ok",
				text: "CSRF zastita: zahtjev ODBIJEN (nedostaje ili neispravan token).",
			};
		}
		return res.redirect("/");
	}
});

app.get("/napad", (req, res) => {
	res.render("napad");
});

(async () => {
	const wasmBinary = fs.readFileSync(
		require.resolve("sql.js/dist/sql-wasm.wasm"),
	);
	const SQL = await initSqlJs({ wasmBinary });
	db = new SQL.Database();

	db.run(`
    CREATE TABLE messages (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      autor  TEXT,
      poruka TEXT,
      pin    TEXT
    );
    INSERT INTO messages (autor, poruka, pin) VALUES
      ('admin', 'Tajni sastanak u 20h iza fakulteta', '4821'),
      ('ivana', 'WiFi lozinka je 12345678', '1337'),
      ('marko', 'Izlazi GTA VI, sutra nejdem na faks', '0000');
  `);

	app.listen(PORT, () => {
		console.log(`Lab2 is listening on: http://localhost:${PORT}`);
	});
})();
