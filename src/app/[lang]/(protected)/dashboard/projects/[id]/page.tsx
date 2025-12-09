import { use } from 'react';

export default function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <div className="w-full h-screen">
      <iframe
        src={`${process.env.NEXT_PUBLIC_LABELSTUDIO_URL}/projects/${id}`}
        className="w-full h-screen"
      />
    </div>
  );
}
