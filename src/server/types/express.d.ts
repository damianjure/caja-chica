import type { AppSession } from "../app.js";

declare global {
  namespace Express {
    interface Request {
      session?: AppSession;
    }
  }
}
