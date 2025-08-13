import { Router } from "express";
import * as ctrl from "../controllers/notebooks.controller.js";

const r = Router();

r.post("/notebooks", ctrl.ingest);
r.get("/notebooks", ctrl.list);
r.delete("/notebooks", ctrl.clear);
r.get("/notebooks/query", ctrl.query);

export default r;
