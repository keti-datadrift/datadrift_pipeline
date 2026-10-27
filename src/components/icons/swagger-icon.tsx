import Image from 'next/image';

interface SwaggerIconProps {
  className?: string;
}

export const SwaggerIcon = ({ className = 'size-4' }: SwaggerIconProps) => (
  <Image
    src="/swagger.svg"
    alt="Swagger"
    className={className}
    width={16}
    height={16}
  />
);
