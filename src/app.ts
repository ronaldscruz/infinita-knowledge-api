import express from "express";
import notebooksRoutes from "./routes/notebooks.js";

export function createApp() {
	const app = express();
	app.get("/", (_req, res) => res.send("Hello World"));
	app.use(notebooksRoutes);

	// Basic error handler (fallback)
	app.use((err: any, _req: any, res: any, _next: any) => {
		res.status(500).json({ error: err?.message ?? String(err) });
	});

	return app;
}
