declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    /** Nome do time no Cloudflare Access. */
    CF_ACCESS_TEAM_DOMAIN?: string;
    /** Application Audience (AUD) Tag da aplicação no Access. */
    CF_ACCESS_AUD?: string;
    /** E-mails autorizados, separados por vírgula. Nunca no repositório. */
    ATLAS_ALLOWED_EMAILS?: string;
  }
}
