export default function LabelStudioServicePage() {
  return (
    <div className="w-full h-screen">
      <iframe
        src={`${process.env.NEXT_PUBLIC_LABELSTUDIO_URL}/projects?page=1`}
        className="w-full h-screen"
      />
    </div>
  );
}
