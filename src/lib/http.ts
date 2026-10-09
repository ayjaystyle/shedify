import {NextResponse} from 'next/server';
import {ZodError} from 'zod';
export class AppError extends Error{constructor(message:string,public status=400){super(message);}}
export function guardOrigin(request:Request){
  const expected=new URL(process.env.NEXT_PUBLIC_APP_URL || request.url).origin;
  if(request.headers.get('origin')!==expected)throw new AppError('Request origin is not permitted.',403);
}
export function failure(error:unknown){
  if(error instanceof ZodError)return NextResponse.json({error:'Check the submitted fields.',fields:error.flatten()}, {status:400});
  if(error instanceof AppError)return NextResponse.json({error:error.message},{status:error.status});
  return NextResponse.json({error:'The operation could not be completed. Check server configuration or retry.'},{status:500});
}
