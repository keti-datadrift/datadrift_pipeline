export default function GradioServicePage() {
  return (
    <div className="w-full h-screen">
      <iframe
        src={process.env.NEXT_PUBLIC_CORE_DEMO_URL}
        className="w-full h-screen"
      />
    </div>
  );
}
