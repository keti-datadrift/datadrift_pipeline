export default function GradioServicePage() {
  return (
    <div className="w-full h-screen">
      {process.env.NEXT_PUBLIC_CORE_DEMO_URL ? (
        <iframe
          src={process.env.NEXT_PUBLIC_CORE_DEMO_URL}
          className="w-full h-screen"
        />
      ) : (
        <div>Not Found</div>
      )}
    </div>
  );
}
