import handlerModule from "../dist/vercel-handler.cjs";

const handler = handlerModule.default || handlerModule;

export default handler;
