export default function handler(req: any, res: any) {
  res.status(200).json({
    status: 'online',
    message: 'TripBuddy API is running',
    endpoints: ['/api/status', '/api/plan', '/api/plan/stream'],
  });
}
