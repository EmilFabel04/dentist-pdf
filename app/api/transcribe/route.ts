import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: Request) {
  try {
    const { blobUrl } = (await request.json()) as { blobUrl?: string };
    if (!blobUrl) {
      return NextResponse.json({ error: "Missing blobUrl" }, { status: 400 });
    }

    const audioResponse = await fetch(blobUrl);
    if (!audioResponse.ok) {
      return NextResponse.json(
        { error: "Failed to fetch audio from blob storage" },
        { status: 502 }
      );
    }

    const audioBlob = await audioResponse.blob();
    const filename = blobUrl.split("/").pop() ?? "audio.webm";
    const file = new File([audioBlob], filename, {
      type: audioBlob.type || "audio/webm",
    });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
    });

    return NextResponse.json({ transcript: transcription.text });
  } catch (error) {
    console.error("[transcribe] error:", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
