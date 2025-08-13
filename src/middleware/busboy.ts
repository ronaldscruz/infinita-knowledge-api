import Busboy from "busboy";
import { Request } from "express";

export function createBusboy(req: Request): Busboy.Busboy {
  return Busboy({ headers: req.headers, limits: { fileSize: 1 * 1024 * 1024 * 1024 } });
}
