"use client";
import { useEffect, useState } from "react";
import { Post as PostComponent } from "../components/Post";
import DOMPurify from "dompurify";

export default function View({ file }) {
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!file) return;

    async function fetchPost() {
      try {
        const response = await fetch(
          `/api/posts?filePath=${encodeURIComponent(file.path)}`
        );
        if (!response.ok) {
          throw new Error("Failed to fetch post");
        }
        const data = await response.json();
        setPost(data);
      } catch (error) {
        console.error("Error fetching post:", error);
        setError(error);
      } finally {
        setLoading(false);
      }
    }

    fetchPost();
  }, [file]);

  if (loading) {
  }

  if (error) {
    return <div>Error loading post.</div>;
  }

  if (!post) {
    return <div>No post found.</div>;
  }

  console.log(post);

  return (
    <div className="w-5/6 p-4">
      <h1>{post.title}</h1>
      <PostComponent
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.body) }}
      />
    </div>
  );
}
