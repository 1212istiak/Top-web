import express, { type Express } from "express";
import path from "path";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

const allowedOrigins = process.env.FRONTEND_URL
  ? [process.env.FRONTEND_URL, "http://localhost:3000", "http://localhost:5173"]
  : true; // allow all in dev

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Serve the built frontend (React) as static files
const frontendPath = path.join(__dirname, "../../tvr-dubbers/dist/public");
app.use(express.static(frontendPath));

// For any non-API route, serve index.html (SPA client-side routing)
// Express 5 / path-to-regexp v8 requires named wildcards: /{*path}
app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

export default app;
