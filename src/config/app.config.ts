export type AppConfig = {
  port: number;
  appUrl: string;
};

export const appConfig = (): AppConfig => ({
  port: Number(process.env.PORT ?? 3000),
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
});
