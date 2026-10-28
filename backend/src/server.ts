import express from "express";
import cors from "cors";

const app=express();
const port=Number(process.env.PORT)||4000;
const pythonApiBase=(process.env.PYTHON_API_URL||"http://localhost:8000").replace(/\/+$/,"");
app.use(cors({origin:process.env.CORS_ORIGIN?.split(",")??"http://localhost:5173"}));
app.use(express.json({limit:"1mb"}));
app.use((req,res,next)=>{res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("X-Frame-Options","DENY");next();});
app.get("/",(_req,res)=>res.json({name:"FoodLens API",docs:"See README.md",health:"/api/health"}));
app.get("/api/health",async(_req,res)=>{
  try {
    const upstream=await fetch(`${pythonApiBase}/api/health`,{signal:AbortSignal.timeout(3000)});
    if(!upstream.ok) return res.status(503).json({error:{code:"UPSTREAM_UNAVAILABLE",message:"Python data service is unavailable"}});
    res.json({status:"ok",service:"foodlens-api",dataService:"ok"});
  } catch {
    res.status(503).json({error:{code:"UPSTREAM_UNAVAILABLE",message:"Python data service is unavailable"}});
  }
});
app.get("/api/search",async(req,res)=>{
  const params=new URLSearchParams();
  for(const key of ["q","cuisine","provider","city","limit"]) {
    const value=req.query[key];
    if(typeof value==="string"&&value.trim()) params.set(key,value.trim());
  }
  try {
    const upstream=await fetch(`${pythonApiBase}/api/search?${params}`,{signal:AbortSignal.timeout(10000)});
    const body=await upstream.json().catch(()=>null);
    if(!upstream.ok) return res.status(upstream.status).json(body??{error:{code:"UPSTREAM_ERROR",message:"Search failed"}});
    res.json(body);
  } catch(error) {
    const timedOut=error instanceof Error&&error.name==="TimeoutError";
    res.status(503).json({error:{code:timedOut?"UPSTREAM_TIMEOUT":"UPSTREAM_UNAVAILABLE",message:timedOut?"Search timed out":"Python data service is unavailable"}});
  }
});
app.use((_req,res)=>res.status(404).json({error:{code:"NOT_FOUND",message:"Route not found"}}));
app.use((err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  console.error("Unhandled API error",err);res.status(500).json({error:{code:"INTERNAL_ERROR",message:"Unexpected server error"}});
});
app.listen(port,()=>console.log(`FoodLens API listening on http://localhost:${port}`));
