import { NextRequest, NextResponse } from "next/server";
import { getPost } from "../../../lib/posts";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(
      req.url || "",
      `http://${req.headers.host}`
    );
    const filePath = searchParams.get("filePath");

    if (!filePath) {
      return NextResponse.json(
        { error: "File path is required" },
        { status: 400 }
      );
    }
    const post = getPost(filePath);

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 400 });
    }
    return NextResponse.json({ post }, { status: 200 });
  } catch (error) {
    console.error("Error reading post:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
