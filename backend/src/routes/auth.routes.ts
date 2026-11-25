import { Router, Request, Response } from "express";
import crypto from "crypto";
import { env } from "../config/env";
import { logger } from "../config/logger";
import {
  getGoogleAuthUrl,
  handleGoogleCallback,
  getOrCreateDevUser,
} from "../services/auth.service";

export function createAuthRouter(
  nodeEnv: typeof env.NODE_ENV = env.NODE_ENV,
): Router {
  const router = Router();

  router.get("/google", (_req: Request, res: Response) => {
    const googleOAuthConfigured =
      !!env.GOOGLE_CLIENT_ID &&
      !!env.GOOGLE_CLIENT_SECRET &&
      env.GOOGLE_CLIENT_ID !== "mock-google-client-id" &&
      env.GOOGLE_CLIENT_SECRET !== "mock-google-client-secret";

    if (!googleOAuthConfigured) {
      if (nodeEnv === "production") {
        res.status(503).json({
          error: {
            code: "GOOGLE_OAUTH_NOT_CONFIGURED",
            message: "Google sign-in is unavailable",
          },
        });
        return;
      }
      logger.info(
        "Google OAuth is unset or mock; redirecting to dev auto-login for testing",
      );
      res.redirect("/auth/dev-login");
      return;
    }

    const state = crypto.randomBytes(16).toString("hex");
    res.cookie("oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.COOKIE_SECURE,
      maxAge: 10 * 60 * 1000,
    });

    const url = getGoogleAuthUrl(state);
    res.redirect(url);
  });

  router.get(
    "/google/callback",
    async (req: Request, res: Response): Promise<void> => {
      const { code, state, error } = req.query;
      const cookieState = req.cookies?.oauth_state;

      if (error || !code || !state || state !== cookieState) {
        logger.warn(
          { error, stateMismatch: state !== cookieState },
          "Google OAuth callback failure",
        );
        res.redirect(`${env.FRONTEND_URL}/login?error=auth_failed`);
        return;
      }

      try {
        res.clearCookie("oauth_state");
        const { token } = await handleGoogleCallback(code as string);

        res.cookie("token", token, {
          httpOnly: true,
          sameSite: "lax",
          secure: env.COOKIE_SECURE,
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        res.redirect(`${env.FRONTEND_URL}/dashboard`);
      } catch (err) {
        logger.error({ err }, "Exception in Google OAuth token exchange");
        res.redirect(`${env.FRONTEND_URL}/login?error=auth_failed`);
      }
    },
  );

  router.get("/dev-login", async (_req: Request, res: Response) => {
    if (nodeEnv === "production") {
      res.sendStatus(404);
      return;
    }

    try {
      const { token } = await getOrCreateDevUser();
      res.cookie("token", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: env.COOKIE_SECURE,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      res.redirect(`${env.FRONTEND_URL}/dashboard`);
    } catch (err) {
      logger.error({ err }, "Dev login failure");
      res.redirect(`${env.FRONTEND_URL}/login?error=auth_failed`);
    }
  });

  router.post("/logout", (_req: Request, res: Response) => {
    res.clearCookie("token", {
      httpOnly: true,
      sameSite: "lax",
      secure: env.COOKIE_SECURE,
    });
    res.json({ success: true, message: "Logged out successfully" });
  });

  return router;
}

export const authRouter = createAuthRouter();
