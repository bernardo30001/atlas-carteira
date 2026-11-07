import handler from "vinext/server/fetch-handler";

const worker = {
  fetch: (request: Request, env: Cloudflare.Env, ctx: ExecutionContext) =>
    handler.fetch(request, env, ctx),
};

export default worker;
