import { Router, type IRouter } from "express";
import healthRouter from "./health";
import episodesRouter from "./episodes";
import commentsRouter from "./comments";
import reactionsRouter from "./reactions";
import settingsRouter from "./settings";
import trailerRouter from "./trailer";
import voiceArtistsRouter from "./voice-artists";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(episodesRouter);
router.use(commentsRouter);
router.use(reactionsRouter);
router.use(settingsRouter);
router.use(trailerRouter);
router.use(voiceArtistsRouter);
router.use(adminRouter);

export default router;
