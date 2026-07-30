import PostEditor from '@/components/PostEditor';

export default function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  return params.then(p => <PostEditor mode="edit" postId={p.id} />);
}
