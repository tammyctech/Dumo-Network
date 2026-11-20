import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useBranding } from "../context/branding";

const SITE_URL = "https://dumo-network.vercel.app";
const SOCIAL_IMAGE = `${SITE_URL}/dyn-favicon-512.png`;

const PUBLIC_ROUTES: Record<string, {title:string;description:string}> = {
  "/": {
    title: "Dumo Youth Network | Rivers State Election Monitoring",
    description: "Follow transparent, unofficial election monitoring updates and civic information across all 23 local government areas in Rivers State, Nigeria.",
  },
  "/live-results": {
    title: "Live Election Results | Rivers State | Dumo Youth Network",
    description: "Follow unofficial agent-submitted 2027 governorship and presidential election results across Rivers State LGAs, wards and polling units.",
  },
};

function setMeta(selector:string,attribute:"name"|"property",key:string,content:string){
  let element=document.head.querySelector<HTMLMetaElement>(selector);
  if(!element){element=document.createElement("meta");element.setAttribute(attribute,key);document.head.appendChild(element)}
  element.content=content;
}

export default function SeoMetadata(){
  const {pathname}=useLocation();
  const branding=useBranding();
  useEffect(()=>{
    const page=PUBLIC_ROUTES[pathname];
    const isPublic=Boolean(page);
    const title=page?.title||`${branding.logo_title} | Secure Monitoring Workspace`;
    const description=page?.description||"Secure election monitoring workspace for authorized Dumo Youth Network personnel.";
    const canonical=`${SITE_URL}${isPublic?pathname:"/"}`;
    document.title=title;
    setMeta('meta[name="description"]',"name","description",description);
    setMeta('meta[name="robots"]',"name","robots",isPublic?"index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1":"noindex, nofollow, noarchive");
    setMeta('meta[property="og:title"]',"property","og:title",title);
    setMeta('meta[property="og:description"]',"property","og:description",description);
    setMeta('meta[property="og:url"]',"property","og:url",canonical);
    setMeta('meta[property="og:image"]',"property","og:image",SOCIAL_IMAGE);
    setMeta('meta[name="twitter:title"]',"name","twitter:title",title);
    setMeta('meta[name="twitter:description"]',"name","twitter:description",description);
    setMeta('meta[name="twitter:image"]',"name","twitter:image",SOCIAL_IMAGE);
    let link=document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if(!link){link=document.createElement("link");link.rel="canonical";document.head.appendChild(link)}
    link.href=canonical;
  },[pathname,branding.logo_title]);
  return null;
}
