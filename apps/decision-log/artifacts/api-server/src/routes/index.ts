import { Router, type IRouter } from "express";
import healthRouter from "./health";
import decisionsRouter from "./decisions";
import insightsRouter from "./insights";

const router: IRouter = Router();

router.use(healthRouter);
router.use(decisionsRouter);
router.use(insightsRouter);

export default router;
