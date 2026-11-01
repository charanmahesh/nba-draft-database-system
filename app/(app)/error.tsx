"use client";
import { Button,EmptyState } from "@/components/ui";
export default function ErrorPage({reset}:{error:Error & {digest?:string};reset:()=>void}){return <div className="mx-auto max-w-4xl px-6 py-10" role="alert"><EmptyState title="Unable to load this page" description="Please try again."><Button onClick={reset}>Try again</Button></EmptyState></div>;}
