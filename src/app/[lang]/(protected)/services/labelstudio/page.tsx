import { use } from 'react';

export default function LabelStudioServicePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = use(params);
  const iframeSrc = `/next-api/external/projects?page=1`;

  return (
    <div className="w-full h-screen">
      <iframe
        src={iframeSrc}
        className="w-full h-screen"
      />
    </div>
  );
}
