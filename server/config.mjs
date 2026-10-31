const int = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));

export function loadConfig(env = process.env) {
  return {
    port: int(env.PORT, 3000),
    anthropicKey: env.ANTHROPIC_API_KEY || '',
    model: env.CLAUDE_MODEL || 'claude-sonnet-5-5',
    appsScriptUrl: env.APPS_SCRIPT_URL || '',
    appsScriptSecret: env.APPS_SCRIPT_SECRET || '',
    aiLimitPerIpHour: int(env.AI_LIMIT_PER_IP_HOUR, 30),
  };
}
