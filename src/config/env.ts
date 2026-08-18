import 'dotenv/config';

export const env = {
  port: Number(process.env.PORT ?? 3000),
  googleApiKey: process.env.GOOGLE_MAPS_API_KEY ?? '',
};
