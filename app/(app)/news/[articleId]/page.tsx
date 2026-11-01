import { NewsDetail } from "@/components/news/news-detail";
export default async function Page({params}:{params:Promise<{articleId:string}>}){return <NewsDetail articleId={(await params).articleId}/>;}
