import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Project } from '@/entities/labelstudio';
import { ModelType } from '@/entities/ml-model';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ModelTypeColors } from '../colors/model-type';
import ModelTypeBadge from '../model-type-badge';

const formSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  type: z.enum(ModelType.allCases()),
});

export default function ProjectEditDialog({
  project,
  open,
  setIsOpen,
  onSubmit,
  loading = false,
}: {
  project: Project;
  open: boolean;
  setIsOpen: (open: boolean) => void;
  onSubmit: (values: z.infer<typeof formSchema>) => void;
  loading?: boolean;
}) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: project.title,
      type: project.type,
    },
  });

  function onFormSubmit(values: z.infer<typeof formSchema>) {
    onSubmit(values);
  }

  return (
    <Dialog open={open} onOpenChange={setIsOpen}>
      <DialogContent aria-describedby="">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onFormSubmit)}
            className="grid gap-4"
          >
            <DialogHeader>
              <DialogTitle>Edit Project</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem className="grid gap-3">
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem className="flex flex-col gap-3">
                    <FormLabel>Model Type</FormLabel>
                    <FormControl>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild className="w-fit">
                          <Button
                            variant="outline"
                            className={[
                              ModelTypeColors[field.value].background10,
                              'border-transparent',
                            ].join(' ')}
                          >
                            {ModelType.presentationName(field.value)}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuRadioGroup
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            {ModelType.allCases().map((type) => (
                              <DropdownMenuRadioItem key={type} value={type}>
                                <ModelTypeBadge type={type} hover="plain" />
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <DialogFooter>
              <Button
                type="submit"
                className="cursor-pointer"
                loading={loading}
              >
                Save
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
