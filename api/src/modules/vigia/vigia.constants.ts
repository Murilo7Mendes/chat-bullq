export const VIGIA_QUEUE = 'vigia-poll';
export const VIGIA_POLL_JOB = 'vigia-poll-job';
export const VIGIA_POLL_PATTERN_DEFAULT = '*/1 * * * *';
// TTL do dedup no Redis (30 dias em segundos)
export const VIGIA_PROCESSED_TTL_S = 30 * 24 * 60 * 60;
// Prefixo da chave Redis para IDs processados
export const VIGIA_REDIS_PREFIX = 'vigia:processed:';
// Regex para capturar CNPJ do assunto (formatado ou só dígitos)
export const CNPJ_REGEX = /(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/;
